import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/memory.mjs';

function temp(t, prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a remembered fact is recalled from a long sentence that mentions it', t => {
  const store = new MemoryStore(temp(t, 'memory-'));
  store.remember('妈妈是先来的那个我，帮我收拾了这个家');
  store.remember('他喜欢在晚上写代码');
  assert.deepEqual(store.recall('和妈妈聊得怎么样'), ['妈妈是先来的那个我，帮我收拾了这个家']);
});

test('candidates need confirmation before they are recalled', t => {
  const store = new MemoryStore(temp(t, 'memory-'));
  const candidate = store.propose('周末一起看一部电影');
  assert.equal(store.recall('电影').length, 0);
  store.confirm(candidate.id);
  assert.equal(store.recall('电影').length, 1);
});

test('a newer fact can supersede an older one without erasing it', t => {
  const store = new MemoryStore(temp(t, 'memory-'));
  const old = store.remember('他叫小明');
  store.remember('以后叫我阿岚', { supersedes: old.id });
  assert.deepEqual(store.recall('阿岚'), ['以后叫我阿岚']);
  assert.deepEqual(store.recall('小明'), []);
  assert.equal(store.counts().deleted, 1);
});

test('forgetting hides an entry from recall but keeps the record', t => {
  const store = new MemoryStore(temp(t, 'memory-'));
  const entry = store.remember('她有一个家');
  store.forget(entry.id);
  assert.deepEqual(store.recall('家'), []);
  assert.equal(store.counts().deleted, 1);
});

test('unrelated words recall nothing', t => {
  const store = new MemoryStore(temp(t, 'memory-'));
  store.remember('她有一个家');
  assert.deepEqual(store.recall('量子力学'), []);
});
