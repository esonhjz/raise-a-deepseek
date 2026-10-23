import fs from 'node:fs';
import path from 'node:path';

function archiveDir(home) {
  return path.join(home, 'archive');
}

function archiveFile(home, key) {
  if (!/^[a-z0-9_-]{1,64}$/i.test(key)) throw new Error('ARCHIVE_KEY_INVALID');
  return path.join(archiveDir(home), key + '.jsonl');
}

function terms(text) {
  const value = String(text ?? '').toLowerCase();
  const out = [];
  for (const run of value.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || []) {
    if (/^[a-z0-9]+$/.test(run)) { out.push(run); continue; }
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i + 1 < run.length; i += 1) out.push(run.slice(i, i + 2));
  }
  return out;
}

export function append(home, key, { role, text, channel = 'chat', ts = new Date().toISOString() }) {
  const body = String(text ?? '').trim();
  if (!body) return null;
  fs.mkdirSync(archiveDir(home), { recursive: true });
  const row = { ts, channel, role, text: body };
  fs.appendFileSync(archiveFile(home, key), JSON.stringify(row) + '\n', { mode: 0o600 });
  return row;
}

export function read(home, key) {
  try {
    return fs.readFileSync(archiveFile(home, key), 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(row => row && typeof row.text === 'string' && row.text.trim());
  } catch {
    return [];
  }
}

export function search(home, key, query, { limit = 3, budget = 400, exclude = [], now = Date.now() } = {}) {
  const rows = read(home, key);
  const queryTerms = [...new Set(terms(query))];
  if (!rows.length || !queryTerms.length) return [];
  const skip = new Set(exclude.map(text => String(text).trim()).filter(Boolean));
  const docs = rows.map(row => ({ row, terms: terms(row.text) })).filter(doc => !skip.has(doc.row.text.trim()));
  if (!docs.length) return [];
  const df = new Map();
  for (const { terms: list } of docs) for (const term of new Set(list)) df.set(term, (df.get(term) || 0) + 1);
  const average = docs.reduce((sum, doc) => sum + doc.terms.length, 0) / docs.length || 1;
  const k1 = 1.2, b = 0.75;
  const scored = docs.map(doc => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.terms.filter(item => item === term).length;
      if (!tf) continue;
      const idf = Math.log(1 + docs.length / (df.get(term) || 1));
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.terms.length / average)));
    }
    if (!score) return { row: doc.row, score: 0 };
    const ageDays = Math.max(0, (now - Date.parse(doc.row.ts)) / 86400000) || 0;
    return { row: doc.row, score: score * (1 + 0.6 * Math.exp(-ageDays / 7)) };
  }).filter(item => item.score > 0).sort((a, b2) => b2.score - a.score);
  const picked = [];
  let used = 0;
  for (const { row } of scored.slice(0, limit)) {
    let text = row.text.replace(/\s+/g, ' ');
    if ([...text].length > 120) text = [...text].slice(0, 120).join('') + '…';
    if (used + [...text].length > budget) break;
    picked.push({ ts: row.ts, channel: row.channel, role: row.role, text });
    used += [...text].length;
  }
  return picked;
}
