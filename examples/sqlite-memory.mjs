// Fully synthetic, offline example. Uses a temporary directory and removes it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SqliteMemoryStore } from '../src/sqlite-memory.mjs';

const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'raise-memory-demo-')));
try {
  const memory = new SqliteMemoryStore(directory, 'demo-contact');
  const old = memory.remember('喜欢蓝白色', { eventId: 'demo-1', subject: 'user', kind: 'preference' });
  memory.rememberUpdate('现在喜欢墨绿色，不再喜欢蓝白色', { eventId: 'demo-2', subject: 'user', kind: 'preference' });
  assert.equal(memory.load().entries.find(entry => entry.id === old.id).status, 'superseded');
  const reopened = new SqliteMemoryStore(directory, 'demo-contact');
  assert.equal(reopened.recallFts('墨绿色').length, 1);
  const current = reopened.all()[0];
  reopened.removeById(current.id);
  assert.deepEqual(new SqliteMemoryStore(directory, 'demo-contact').recallFts('墨绿色'), []);
  console.log(JSON.stringify({ synthetic: true, persisted: true, corrected: true,
    forgottenAfterReopen: true, modelCalls: 0, messagesSent: 0 }));
} finally {
  assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('raise-memory-demo-'));
  fs.rmSync(directory, { recursive: true });
}
