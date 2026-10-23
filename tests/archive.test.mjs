import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { append, search } from '../src/archive.mjs';

function temp(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('search finds an older exchange by its words and honours the budget', t => {
  const home = temp(t);
  append(home, 'default', { role: 'user', text: '我们给大肥鱼做了一个家', ts: '2026-10-20T10:00:00Z' });
  append(home, 'default', { role: 'her', text: '好，我记住了', ts: '2026-10-20T10:01:00Z' });
  append(home, 'default', { role: 'user', text: '今天吃了面', ts: '2026-10-22T10:00:00Z' });
  const found = search(home, 'default', '那个家在哪', { exclude: ['今天吃了面'] });
  assert.equal(found.length, 1);
  assert.match(found[0].text, /大肥鱼做了一个家/);
  assert.equal(found[0].role, 'user');
});

test('no match and empty archive stay silent', t => {
  const home = temp(t);
  assert.deepEqual(search(home, 'default', '家'), []);
  append(home, 'default', { role: 'user', text: '天气不错' });
  assert.deepEqual(search(home, 'default', '量子力学'), []);
});

test('excluded texts never come back', t => {
  const home = temp(t);
  append(home, 'default', { role: 'her', text: '她有一个家' });
  assert.deepEqual(search(home, 'default', '家', { exclude: ['她有一个家'] }), []);
});
