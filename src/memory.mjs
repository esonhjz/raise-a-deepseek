import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_ENTRIES = 2000;
const MAX_TEXT = 500;
const STOP = new Set(['一下', '这个', '那个', '什么', '怎么', '可以', '我们', '你们', '他们', '还是', '就是', '因为', '所以', '不是', '没有']);

function normalize(text) {
  return String(text ?? '').replace(/\s+/gu, ' ').trim();
}

function terms(query) {
  const text = String(query ?? '').toLowerCase();
  const ascii = text.match(/[a-z0-9_]{2,}/g) ?? [];
  const cjk = [...text.replace(/[^\u3400-\u9fff]/g, '')];
  const grams = [];
  for (let i = 0; i + 1 < cjk.length; i += 1) {
    const gram = cjk[i] + cjk[i + 1];
    if (!STOP.has(gram)) grams.push(gram);
  }
  if (cjk.length === 1) grams.push(cjk[0]);
  return [...new Set([...ascii, ...grams])];
}

function overlap(entry, list) {
  const haystack = entry.text.toLowerCase();
  return list.filter(term => haystack.includes(term)).length;
}

export class MemoryStore {
  constructor(directory, key = 'default') {
    if (!/^[a-z0-9_-]{1,64}$/i.test(key)) throw new Error('MEMORY_KEY_INVALID');
    this.directory = path.resolve(directory);
    this.key = key;
    fs.mkdirSync(this.directory, { recursive: true });
    this.file = path.join(this.directory, key + '.json');
  }

  load() {
    if (!fs.existsSync(this.file)) return { version: 1, entries: [] };
    const state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.entries) || state.entries.length > MAX_ENTRIES) {
      throw new Error('MEMORY_STATE_INVALID');
    }
    return state;
  }

  save(state) {
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  propose(text) {
    const value = normalize(text);
    if ([...value].length < 2) return null;
    const state = this.load();
    const entry = { id: randomUUID(), text: [...value].slice(0, MAX_TEXT).join(''), status: 'candidate',
      createdAt: new Date().toISOString(), source: 'proposal' };
    state.entries.push(entry);
    this.save(state);
    return entry;
  }

  confirm(id = null) {
    const state = this.load();
    const entry = (id ? state.entries.find(item => item.id === id) : state.entries.filter(item => item.status === 'candidate').at(-1));
    if (!entry || entry.status !== 'candidate') return null;
    entry.status = 'confirmed';
    entry.confirmedAt = new Date().toISOString();
    this.save(state);
    return entry;
  }

  remember(text, { supersedes = null, source = 'manual' } = {}) {
    const value = normalize(text);
    if ([...value].length < 2) return null;
    const state = this.load();
    if (state.entries.length >= MAX_ENTRIES) throw new Error('MEMORY_FULL');
    if (supersedes) {
      const previous = state.entries.find(item => item.id === supersedes);
      if (previous) { previous.status = 'deleted'; previous.deletedAt = new Date().toISOString(); }
    }
    const entry = { id: randomUUID(), text: [...value].slice(0, MAX_TEXT).join(''), status: 'confirmed',
      createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), source,
      ...(supersedes ? { supersedes } : {}) };
    state.entries.push(entry);
    this.save(state);
    return entry;
  }

  forget(id) {
    const state = this.load();
    const entry = state.entries.find(item => item.id === id && item.status === 'confirmed');
    if (!entry) return null;
    entry.status = 'deleted';
    entry.deletedAt = new Date().toISOString();
    this.save(state);
    return entry;
  }

  all(status = 'confirmed') {
    return this.load().entries.filter(entry => entry.status === status);
  }

  counts() {
    const entries = this.load().entries;
    return {
      confirmed: entries.filter(entry => entry.status === 'confirmed').length,
      candidates: entries.filter(entry => entry.status === 'candidate').length,
      deleted: entries.filter(entry => entry.status === 'deleted').length,
    };
  }

  recall(query, limit = 5) {
    const list = terms(query);
    const confirmed = this.all('confirmed');
    if (list.length === 0) return confirmed.slice(-limit);
    return confirmed
      .map((entry, index) => ({ entry, score: overlap(entry, list), index }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.index - a.index)
      .slice(0, limit)
      .map(item => item.entry.text);
  }
}

export { terms as memoryTerms };
