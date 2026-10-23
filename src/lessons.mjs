import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const STATUSES = new Set(['pending', 'answered', 'reviewed']);

// One lesson at a time: a task, an example, her answer, and a review. No model
// calls here; the host decides when to deliver and when to ask.
export class LessonBook {
  constructor(directory) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true });
    this.file = path.join(this.directory, 'lessons.json');
  }

  load() {
    if (!fs.existsSync(this.file)) return { version: 1, lessons: [] };
    const state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.lessons)) throw new Error('LESSONS_STATE_INVALID');
    return state;
  }

  save(state) {
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  add({ topic, task, example = '' }) {
    const state = this.load();
    const lesson = { id: randomUUID(), topic: String(topic ?? '').trim(), task: String(task ?? '').trim(),
      example: String(example ?? '').trim(), status: 'pending', createdAt: new Date().toISOString() };
    if (!lesson.topic || !lesson.task) throw new Error('LESSON_INCOMPLETE');
    state.lessons.push(lesson);
    this.save(state);
    return lesson;
  }

  list() {
    return this.load().lessons;
  }

  pending() {
    return this.load().lessons.filter(lesson => lesson.status === 'pending');
  }

  answer(id, text) {
    const state = this.load();
    const lesson = state.lessons.find(item => item.id === id);
    if (!lesson || lesson.status !== 'pending') return null;
    lesson.answer = String(text ?? '').trim();
    if (!lesson.answer) return null;
    lesson.status = 'answered';
    lesson.answeredAt = new Date().toISOString();
    this.save(state);
    return lesson;
  }

  review(id, feedback) {
    const state = this.load();
    const lesson = state.lessons.find(item => item.id === id);
    if (!lesson || !STATUSES.has(lesson.status) || lesson.status === 'pending') return null;
    lesson.feedback = String(feedback ?? '').trim();
    lesson.status = 'reviewed';
    lesson.reviewedAt = new Date().toISOString();
    this.save(state);
    return lesson;
  }
}
