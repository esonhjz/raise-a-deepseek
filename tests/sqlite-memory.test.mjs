import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SqliteMemoryStore, sqliteContactKey } from '../src/sqlite-memory.mjs';
import database from '../src/internal/memory-db.cjs';

function temp(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'raise-sqlite-test-')));
  t.after(() => {
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('raise-sqlite-test-'));
    fs.rmSync(directory, { recursive: true });
  });
  return directory;
}

test('SQLite persists facts across instances and isolates caller-supplied contacts', t => {
  const directory = temp(t);
  new SqliteMemoryStore(directory, 'alice').remember('喜欢墨绿色', { eventId: 'synthetic-1', subject: 'user' });
  const reopened = new SqliteMemoryStore(directory, 'alice');
  assert.deepEqual(reopened.recall('墨绿色'), ['喜欢墨绿色']);
  assert.deepEqual(new SqliteMemoryStore(directory, 'bob').recall('墨绿色'), []);
  assert.equal(reopened.recallForPrompt('墨绿色')[0], '联系人：喜欢墨绿色');
});

test('deleted and superseded facts do not reappear through FTS or reopening', t => {
  const directory = temp(t), memory = new SqliteMemoryStore(directory, 'alice');
  const old = memory.remember('喜欢蓝白色', { eventId: 'synthetic-1' });
  const current = memory.rememberUpdate('现在喜欢墨绿色，不再喜欢蓝白色', { eventId: 'synthetic-2' });
  assert.equal(memory.load().entries.find(entry => entry.id === old.id).status, 'superseded');
  assert.equal(memory.recallFts('墨绿色')[0].id, current.id);
  memory.removeById(current.id);
  const reopened = new SqliteMemoryStore(directory, 'alice');
  assert.deepEqual(reopened.recallFts('墨绿色'), []);
  assert.deepEqual(reopened.recall('蓝白色'), []);
});

test('stale or missing revisions cannot resurrect forgotten entries', t => {
  const directory = temp(t), memory = new SqliteMemoryStore(directory, 'alice');
  const entry = memory.remember('喜欢咖啡');
  const stale = memory.load();
  new SqliteMemoryStore(directory, 'alice').removeById(entry.id);
  assert.throws(() => memory.save(stale), /MEMORY_CONFLICT/);
  for (const revision of [undefined, null, '1', -1, 0.5, NaN, Infinity]) {
    assert.throws(() => memory.save({ entries: stale.entries, revision }), /MEMORY_REVISION_REQUIRED/);
  }
  assert.deepEqual(memory.recall('咖啡'), []);
});

test('snapshot entries and revision agree when another writer commits between reads', t => {
  const directory = temp(t), memory = new SqliteMemoryStore(directory, 'alice');
  const entry = memory.remember('喜欢咖啡');
  // Actual snapshot consistency is checked below with two SQLite connections.
  const reader = database.open(directory), writer = database.open(directory);
  try {
    reader.exec('BEGIN');
    const entries = database.load(reader, memory.contactKey);
    database.mutate(writer, memory.contactKey, 'synthetic-delete', list => {
      list.find(item => item.id === entry.id).status = 'deleted';
    });
    const revision = database.revisionOf(reader, memory.contactKey);
    reader.exec('COMMIT');
    assert.equal(entries[0].status, 'confirmed');
    assert.throws(() => memory.save({ entries, revision }), /MEMORY_CONFLICT/);
  } finally { reader.close(); writer.close(); }
});

test('legacy hashed JSON imports once and preserves unknown fields and tombstones', t => {
  const directory = temp(t), key = sqliteContactKey('import-contact');
  const entries = [{ id: '11111111-1111-4111-8111-111111111111', text: '合成旧记录', status: 'deleted',
    createdAt: '2026-01-01T00:00:00.000Z', custom: { preserve: true }, source: { kind: 'synthetic', eventId: 'sample' } }];
  fs.writeFileSync(path.join(directory, key + '.json'), JSON.stringify({ version: 1, entries }));
  const memory = new SqliteMemoryStore(directory, 'import-contact');
  assert.deepEqual(memory.load().entries, entries);
  assert.deepEqual(memory.recall('旧记录'), []);
  assert.deepEqual(new SqliteMemoryStore(directory, 'import-contact').load().entries, entries);
});

test('failed migration can be retried and does not partially import a broken source', t => {
  const directory = temp(t), key = sqliteContactKey('broken');
  const file = path.join(directory, key + '.json');
  fs.writeFileSync(file, '{invalid');
  assert.throws(() => new SqliteMemoryStore(directory, 'broken'));
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: [] }));
  assert.deepEqual(new SqliteMemoryStore(directory, 'broken').load().entries, []);
});

test('FTS handles short Chinese, special syntax, scoping and derived-index rebuild', t => {
  const directory = temp(t), memory = new SqliteMemoryStore(directory, 'alice');
  memory.remember('阿岚的生日是三月十四日');
  new SqliteMemoryStore(directory, 'bob').remember('保密的生日线索');
  assert.equal(memory.recallFts('生日').length, 1);
  assert.deepEqual(memory.recallFts('不存在 OR " - : *'), []);
  const db = database.open(directory);
  try { db.exec('DELETE FROM memory_fts'); database.rebuildFts(db); }
  finally { db.close(); }
  assert.equal(memory.recallFts('生日')[0].text, '阿岚的生日是三月十四日');
});

test('shadow observation compares IDs without changing legacy output or exposing text', t => {
  const directory = temp(t), observations = [];
  const memory = new SqliteMemoryStore(directory, 'alice', { retrievalMode: 'shadow', onShadow: row => observations.push(row) });
  memory.remember('喜欢墨绿色', { subject: 'user' });
  assert.deepEqual(memory.recallForPrompt('墨绿色'), memory.recallForPromptLegacy('墨绿色'));
  assert.equal(observations[0].overlap, 1);
  assert.equal(JSON.stringify(observations).includes('墨绿色'), false);
  assert.equal(fs.existsSync(path.join(directory, 'memory-shadow.log')), false);
});

test('multiple processes preserve independent additions', async t => {
  const directory = temp(t);
  new SqliteMemoryStore(directory, 'shared-contact');
  const moduleUrl = new URL('../src/sqlite-memory.mjs', import.meta.url).href;
  const code = `import { SqliteMemoryStore } from ${JSON.stringify(moduleUrl)};
    const memory = new SqliteMemoryStore(process.argv[1], 'shared-contact');
    memory.remember('synthetic parallel ' + process.argv[2], { eventId: 'parallel-' + process.argv[2] });`;
  await Promise.all(Array.from({ length: 4 }, (_, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, directory, String(index)],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('error', reject);
    child.once('exit', status => status === 0 ? resolve() : reject(new Error(errors)));
  })));
  assert.equal(new SqliteMemoryStore(directory, 'shared-contact').all().length, 4);
});
