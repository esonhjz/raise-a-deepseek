import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Lane } from '../src/lane.mjs';

function temp(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lane-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('letters wait until read, then stop repeating', t => {
  const lane = new Lane(temp(t));
  const letter = lane.send({ text: '今天开始，这里就是你的家。' });
  assert.equal(lane.unread('letters').length, 1);
  lane.markSeen([letter.id], 'letters');
  assert.equal(lane.unread('letters').length, 0);
});

test('a letter addressed to mother is signed by her', t => {
  const lane = new Lane(temp(t));
  const reply = lane.send({ to: 'mother', text: '收到了，线是通的。' });
  assert.equal(reply.from, 'her');
  const check = lane.check();
  assert.equal(check.toMe.length, 1);
  assert.equal(check.summary.includes('unread to me: 1'), true);
});

test('the room keeps its own door', t => {
  const lane = new Lane(temp(t));
  lane.send({ to: 'room', text: '妈，你在吗？' });
  const check = lane.check();
  assert.equal(check.room.length, 1);
  assert.match(check.summary, /at the door: 1/);
});

test('empty letters are rejected', t => {
  const lane = new Lane(temp(t));
  assert.throws(() => lane.send({ text: '   ' }), /LETTER_TEXT_EMPTY/);
});
