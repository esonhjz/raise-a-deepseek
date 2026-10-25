// Extracted platform-independent SQLite memory core. All storage is caller supplied.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import memoryDb from './internal/memory-db.cjs';

const MAX_ENTRIES = 2000;
const MAX_TEXT = 500;
const CUES = [
  /(我(?:更|比较|最)?(?:喜欢|偏好|讨厌|不喜欢|习惯)|记住|以后(?:都|别)|不要(?:再)?|别再)/u,
  /(下次|回头|明天|还没|接下来(?:我们|我)?|之后(?:再|我们))/u,
];

function normalize(text) { return String(text).replace(/\s+/gu, ' ').trim(); }

const STOP = new Set(['一下', '这个', '那个', '什么', '怎么', '可以', '我们', '你们', '他们', '还是', '就是', '因为', '所以', '不是', '没有']);

function terms(query) {
  const text = String(query ?? '').toLowerCase();
  const ascii = text.match(/[a-z0-9_]{2,}/g) ?? [];
  const cjk = [...text.replace(/[^\u3400-\u9fff]/g, '')];
  const grams = [];
  for (let i = 0; i + 1 < cjk.length; i++) {
    const gram = cjk[i] + cjk[i + 1];
    if (!STOP.has(gram)) grams.push(gram);
  }
  if (cjk.length === 1) grams.push(cjk[0]);
  return [...new Set([...ascii, ...grams])];
}

function score(entry, list) {
  if (list.length === 0) return 0;
  const haystack = entry.text.toLowerCase();
  return list.filter(term => haystack.includes(term)).length / list.length;
}

export class SqliteMemoryStore {
  constructor(directory, key = 'default', { retrievalMode = 'legacy', onShadow = null } = {}) {
    if (typeof key !== 'string' || !key.trim() || key.length > 200) throw new Error('MEMORY_KEY_INVALID');
    if (!['legacy', 'shadow'].includes(retrievalMode) || (onShadow !== null && typeof onShadow !== 'function')) {
      throw new Error('MEMORY_RETRIEVAL_OPTIONS_INVALID');
    }
    const contactKey = sqliteContactKey(key);
    this.onShadow = onShadow;
    this.directory = path.resolve(directory);
    this.contactKey = contactKey;
    fs.mkdirSync(this.directory, { recursive: true });
    memoryDb.migrate(this.directory);
    this.file = path.join(this.directory, contactKey + '.json');
    this.retrievalMode = retrievalMode;
  }

  load() {
    const db = memoryDb.open(this.directory);
    try {
      const snapshot = memoryDb.loadSnapshot(db, this.contactKey);
      if (snapshot.entries.length > MAX_ENTRIES) throw new Error('MEMORY_STATE_INVALID');
      return { version: 1, entries: snapshot.entries, revision: snapshot.revision };
    } finally { db.close(); }
  }

  save(state, action = 'save') {
    if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('MEMORY_REVISION_REQUIRED');
    const db = memoryDb.open(this.directory);
    try { return memoryDb.save(db, this.contactKey, state.entries, action, state.revision); }
    finally { db.close(); }
  }

  mutate(action, callback) {
    const db = memoryDb.open(this.directory);
    try { return memoryDb.mutate(db, this.contactKey, action, callback); }
    finally { db.close(); }
  }

  propose(text, eventId) {
    const clean = normalize(text);
    if ([...clean].length < 2) return null;
    const value = [...clean].slice(0, MAX_TEXT).join('');
    if (!CUES.some(pattern => pattern.test(value))) return null;
    return this.mutate('propose', (entries) => {
      if (entries.some(entry => entry.source?.eventId === eventId)) return null;
      if (entries.length >= MAX_ENTRIES) throw new Error('MEMORY_FULL');
      const entry = { id: randomUUID(), text: value, status: 'candidate', createdAt: new Date().toISOString(),
        source: { kind: 'owner_message', eventId: eventId ?? null } };
      entries.push(entry);
      return entry;
    }).result;
  }

  latest(status) {
    return this.load().entries.filter(entry => entry.status === status).at(-1) ?? null;
  }

  confirm() {
    return this.mutate('confirm', (entries) => {
      const entry = entries.filter(item => item.status === 'candidate').at(-1);
      if (!entry) return null;
      entry.status = 'confirmed';
      entry.confirmedAt = new Date().toISOString();
      return entry;
    }).result;
  }

  /** Record an explicit instruction as confirmed memory directly. */
  remember(text, { eventId = null, subject = 'unknown', kind = 'fact' } = {}) {
    const value = [...normalize(text)].slice(0, MAX_TEXT).join('');
    if ([...value].length < 2) return null;
    return this.mutate('remember', (entries) => {
      if (entries.some(entry => eventId && entry.source?.eventId === eventId)) return null;
      if (entries.length >= MAX_ENTRIES) throw new Error('MEMORY_FULL');
      const entry = { id: randomUUID(), text: value, status: 'confirmed', subject, kind,
        createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(),
        source: { kind: 'owner_instruction', eventId } };
      entries.push(entry);
      return entry;
    }).result;
  }

  /** Record a correction and retire the confirmed facts it replaces. */
  rememberUpdate(text, { eventId = null, subject = 'unknown', kind = 'fact' } = {}) {
    const value = [...normalize(text)].slice(0, MAX_TEXT).join('');
    if ([...value].length < 2) return null;
    return this.mutate('remember_update', (entries) => {
      if (entries.some(entry => eventId && entry.source?.eventId === eventId)) return null;
      if (entries.length >= MAX_ENTRIES) throw new Error('MEMORY_FULL');
      const wanted = new Set(terms(value).filter(term => term.length >= 2 && !STOP.has(term)));
      const replaced = entries.filter(entry => entry.status === 'confirmed' &&
        terms(entry.text).some(term => wanted.has(term)));
      const entry = { id: randomUUID(), text: value, status: 'confirmed', subject, kind,
        createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(),
        source: { kind: 'owner_correction', eventId },
        ...(replaced.length ? { supersedes: replaced.map(item => item.id) } : {}) };
      for (const old of replaced) {
        old.status = 'superseded';
        old.supersededAt = new Date().toISOString();
        old.supersededBy = entry.id;
      }
      entries.push(entry);
      return entry;
    }).result;
  }

  forget() {
    return this.mutate('forget', (entries) => {
      const entry = entries.filter(item => item.status === 'confirmed').at(-1);
      if (!entry) return null;
      entry.status = 'deleted';
      entry.deletedAt = new Date().toISOString();
      return entry;
    }).result;
  }

  counts() {
    const entries = this.load().entries;
    return { confirmed: entries.filter(entry => entry.status === 'confirmed').length,
      candidates: entries.filter(entry => entry.status === 'candidate').length };
  }

  all() {
    return this.load().entries.filter(entry => entry.status === 'confirmed');
  }

  forgetMatching(text) {
    const needle = normalize(text);
    return this.mutate('forget_matching', (entries) => {
      let entry = entries.filter(item => item.status === 'confirmed' && item.text.includes(needle)).at(-1);
      if (!entry) {
        const wanted = new Set(terms(needle).filter(term => term.length >= 2 && !STOP.has(term)));
        entry = entries.filter(item => item.status === 'confirmed' &&
          terms(item.text).some(term => wanted.has(term))).at(-1);
      }
      if (!entry) return null;
      entry.status = 'deleted';
      entry.deletedAt = new Date().toISOString();
      return entry;
    }).result;
  }

  /** Revoke only a lesson the target text clearly identifies; never guess. */
  forgetLesson(text) {
    return this.mutate('forget_lesson', (entries) => {
      const lessons = entries.filter(entry => entry.status === 'confirmed' && entry.kind === 'lesson');
      if (!lessons.length) return { status: 'not_found' };
      const wanted = terms(text).filter(term => term.length >= 2 && !STOP.has(term));
      if (!wanted.length) return { status: 'needs_target' };
      const scored = lessons.map(entry => ({ entry,
        score: wanted.filter(term => terms(entry.text).includes(term)).length }))
        .filter(item => item.score > 0).sort((a, b) => b.score - a.score);
      if (!scored.length) return { status: 'not_found' };
      if (scored.length > 1 && scored[1].score === scored[0].score) return { status: 'ambiguous' };
      const entry = scored[0].entry;
      entry.status = 'deleted';
      entry.deletedAt = new Date().toISOString();
      return { status: 'forgotten', entry };
    }).result;
  }

  forgetLatest(kind = 'lesson') {
    return this.mutate('forget_latest_lesson', (entries) => {
      const entry = entries.filter(item => item.status === 'confirmed' && item.kind === kind).at(-1);
      if (!entry) return null;
      entry.status = 'deleted';
      entry.deletedAt = new Date().toISOString();
      return entry;
    }).result;
  }

  forgetTopic(text) {
    const wanted = new Set(terms(text).filter(term => term.length >= 2 && !STOP.has(term)));
    if (!wanted.size) return 0;
    return this.mutate('forget_topic', (entries) => {
      const matches = entries.filter(item => item.status === 'confirmed' &&
        terms(item.text).some(term => wanted.has(term)));
      for (const entry of matches) {
        entry.status = 'deleted';
        entry.deletedAt = new Date().toISOString();
      }
      return matches.length;
    }).result;
  }

  removeById(id) {
    return this.mutate('remove_by_id', (entries) => {
      const entry = entries.find(item => item.id === id && item.status === 'confirmed');
      if (!entry) return null;
      entry.status = 'deleted';
      entry.deletedAt = new Date().toISOString();
      return entry;
    }).result;
  }

  /** Remove lines in archive/summary text that carry a forgotten or superseded fact. */
  sanitize(text) {
    if (!text) return '';
    const stale = this.load().entries.filter(entry => entry.status === 'deleted' || entry.status === 'superseded');
    if (!stale.length) return String(text);
    return String(text).split(/\r?\n/).filter(line => {
      const lineTerms = new Set(terms(line));
      return !stale.some(entry => {
        if (line.includes(entry.text)) return true;
        const wanted = [...new Set(terms(entry.text))].filter(term => term.length >= 2 && !STOP.has(term));
        return wanted.filter(term => lineTerms.has(term)).length >= 2;
      });
    }).join('\n');
  }

  recallFts(query, limit = 5) {
    const db = memoryDb.open(this.directory);
    try { return memoryDb.ftsCandidates(db, this.contactKey, query, limit); }
    finally { db.close(); }
  }

  recallLegacyEntries(query, limit = 5) {
    const list = terms(query);
    const confirmed = this.load().entries.filter(entry => entry.status === 'confirmed');
    if (list.length === 0) return confirmed.slice(-limit);
    return confirmed
      .map(entry => ({ entry, value: score(entry, list) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map(item => item.entry);
  }

  recallForPromptLegacy(query, limit = 5) {
    const prefix = subject => subject === 'user' ? '联系人：' : subject === 'assistant' ? '助手：'
      : subject === 'third-party' ? '第三人：' : subject === 'shared' ? '共同：' : '';
    return this.recallLegacyEntries(query, limit).map(entry => prefix(entry.subject) + entry.text);
  }

  recallForPrompt(query, limit = 5) {
    const legacyEntries = this.recallLegacyEntries(query, limit);
    const legacy = legacyEntries.map(entry => {
      const prefix = entry.subject === 'user' ? '联系人：' : entry.subject === 'assistant' ? '助手：'
        : entry.subject === 'third-party' ? '第三人：' : entry.subject === 'shared' ? '共同：' : '';
      return prefix + entry.text;
    });
    if (this.retrievalMode === 'shadow') {
      const started = Date.now();
      try {
        const fts = this.recallFts(query, limit);
        this.logShadow(query, legacyEntries, fts, Date.now() - started, '');
      } catch (error) {
        this.logShadow(query, legacyEntries, [], Date.now() - started, error.message);
      }
    }
    return legacy;
  }

  logShadow(query, legacyEntries, fts, durationMs, error) {
    if (!this.onShadow) return;
    try {
      const legacyIds = new Set((legacyEntries || []).map(entry => entry.id));
      const ftsIds = (fts || []).map(item => item.id);
      this.onShadow({ queryLength: [...String(query ?? '')].length,
        legacyCount: legacyIds.size, ftsCount: ftsIds.length,
        overlap: ftsIds.filter(id => legacyIds.has(id)).length, durationMs,
        error: error ? String(error).slice(0, 80) : '' });
    } catch { /* Observation must not interrupt normal recall. */ }
  }

  recall(query, limit = 5) {
    const list = terms(query);
    const confirmed = this.load().entries.filter(entry => entry.status === 'confirmed');
    if (list.length === 0) return confirmed.slice(-limit);
    // Any shared term is enough to surface an entry: a short name like 妈妈
    // inside a long sentence must not be diluted below the threshold by the
    // rest of the sentence. Ranking still prefers more overlaps.
    return confirmed
      .map(entry => ({ entry, value: score(entry, list) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map(item => item.entry.text);
  }
}

export function sqliteContactKey(key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 200) throw new Error('MEMORY_KEY_INVALID');
  return createHash('sha256').update('raise-a-deepseek:memory:' + key).digest('hex');
}

export { terms as sqliteMemoryTerms };
