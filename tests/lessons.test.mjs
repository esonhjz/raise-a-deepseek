import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LessonBook } from '../src/lessons.mjs';

function temp(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a lesson goes from pending to answered to reviewed', t => {
  const book = new LessonBook(temp(t));
  const lesson = book.add({ topic: '说话方式', task: '把这句话改短', example: '原句……' });
  assert.equal(book.pending().length, 1);
  const answered = book.answer(lesson.id, '改短后的句子');
  assert.equal(answered.status, 'answered');
  const reviewed = book.review(lesson.id, '好，保留');
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(book.list()[0].answer, '改短后的句子');
});

test('incomplete lessons are rejected', t => {
  const book = new LessonBook(temp(t));
  assert.throws(() => book.add({ topic: '', task: '' }), /LESSON_INCOMPLETE/);
});
