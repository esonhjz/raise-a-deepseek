'use strict';

// SQLite memory v2: one private database per memory directory, one row per
// contact-owned memory. `data_json` preserves fields the current schema does not
// yet query, so migration does not silently drop unknown data.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_NAME = 'memories.sqlite';
const SCHEMA_VERSION = 3;
const CONTACT = /^[a-f0-9]{64}$/;

function dbFile(directory) { return path.join(path.resolve(directory), DB_NAME); }

function open(directory) {
  const file = dbFile(directory);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_schema (
      version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_meta (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_contact_versions (
      contact_key TEXT PRIMARY KEY, revision INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      contact_key TEXT NOT NULL, id TEXT NOT NULL, text TEXT NOT NULL,
      status TEXT NOT NULL, subject TEXT, kind TEXT, created_at TEXT,
      confirmed_at TEXT, superseded_at TEXT, superseded_by TEXT, deleted_at TEXT,
      source_kind TEXT, source_event_id TEXT, data_json TEXT NOT NULL,
      PRIMARY KEY (contact_key, id)
    );
    CREATE INDEX IF NOT EXISTS memories_contact_status ON memories(contact_key, status, created_at);
    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY, contact_key TEXT NOT NULL, memory_id TEXT,
      action TEXT NOT NULL, at TEXT NOT NULL, data_json TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      contact_key UNINDEXED, memory_id UNINDEXED, text, tokenize='trigram'
    );
    CREATE TRIGGER IF NOT EXISTS memories_fts_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memory_fts(rowid, contact_key, memory_id, text) VALUES (new.rowid, new.contact_key, new.id, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_fts_ad AFTER DELETE ON memories BEGIN
      DELETE FROM memory_fts WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS memories_fts_au AFTER UPDATE ON memories BEGIN
      DELETE FROM memory_fts WHERE rowid = old.rowid;
      INSERT INTO memory_fts(rowid, contact_key, memory_id, text) VALUES (new.rowid, new.contact_key, new.id, new.text);
    END;
  `);
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO memory_schema(version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, now);
  ensureFts(db);
  return db;
}

function ensureFts(db) {
  const indexed = db.prepare("SELECT value FROM memory_meta WHERE key='fts_index_version'").get();
  const memories = db.prepare('SELECT count(*) AS n FROM memories').get().n;
  const indexedRows = db.prepare('SELECT count(*) AS n FROM memory_fts').get().n;
  if (indexed?.value === String(SCHEMA_VERSION) && memories === indexedRows) return;
  rebuildFts(db);
}

function rebuildFts(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM memory_fts;');
    db.exec('INSERT INTO memory_fts(rowid, contact_key, memory_id, text) SELECT rowid, contact_key, id, text FROM memories;');
    db.prepare("INSERT INTO memory_meta(key,value) VALUES ('fts_index_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(String(SCHEMA_VERSION));
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

function validateEntry(entry, contactKey) {
  if (!entry || typeof entry !== 'object' || !/^[a-f0-9-]{36}$/.test(entry.id || '') ||
      typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 4000 ||
      !['candidate', 'confirmed', 'superseded', 'deleted'].includes(entry.status) ||
      typeof entry.createdAt !== 'string') throw new Error('MEMORY_MIGRATION_INVALID');
  if (entry.subject !== undefined && typeof entry.subject !== 'string') throw new Error('MEMORY_MIGRATION_INVALID');
  if (entry.kind !== undefined && typeof entry.kind !== 'string') throw new Error('MEMORY_MIGRATION_INVALID');
  if (!CONTACT.test(contactKey)) throw new Error('MEMORY_MIGRATION_INVALID');
  return entry;
}

function placeholders(values) { return values.map(() => '?').join(','); }

function rowOf(contactKey, entry) {
  return { contact_key: contactKey, id: entry.id, text: entry.text, status: entry.status,
    subject: entry.subject ?? null, kind: entry.kind ?? null, created_at: entry.createdAt ?? null,
    confirmed_at: entry.confirmedAt ?? null, superseded_at: entry.supersededAt ?? null,
    superseded_by: entry.supersededBy ?? null, deleted_at: entry.deletedAt ?? null,
    source_kind: entry.source?.kind ?? null, source_event_id: entry.source?.eventId ?? null,
    data_json: JSON.stringify(entry) };
}

function insertEntry(db, contactKey, entry) {
  const row = rowOf(contactKey, entry);
  db.prepare(`INSERT OR IGNORE INTO memories
    (contact_key,id,text,status,subject,kind,created_at,confirmed_at,superseded_at,superseded_by,deleted_at,source_kind,source_event_id,data_json)
    VALUES (${placeholders(Object.values(row))})`).run(...Object.values(row));
  const existing = db.prepare('SELECT data_json FROM memories WHERE contact_key=? AND id=?').get(contactKey, entry.id);
  if (!existing || existing.data_json !== row.data_json) throw new Error('MEMORY_MIGRATION_CONFLICT');
}

function event(db, contactKey, memoryId, action, data, at = new Date().toISOString()) {
  db.prepare('INSERT INTO memory_events(id,contact_key,memory_id,action,at,data_json) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), contactKey, memoryId, action, at, JSON.stringify(data ?? {}));
}

function migrationManifest(directory) {
  const files = fs.readdirSync(directory).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort();
  return files.map(name => ({ name,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex') }));
}

function migrate(directory) {
  const db = open(directory);
  const marker = db.prepare("SELECT value FROM memory_meta WHERE key='legacy_json_migrated'").get();
  if (marker) { db.close(); return { migrated: false, version: SCHEMA_VERSION }; }
  const manifest = migrationManifest(directory);
  const transaction = db.prepare('BEGIN IMMEDIATE');
  try {
    transaction.run();
    const again = db.prepare("SELECT value FROM memory_meta WHERE key='legacy_json_migrated'").get();
    if (again) { db.exec('COMMIT'); db.close(); return { migrated: false, version: SCHEMA_VERSION }; }
    for (const file of manifest) {
      const contactKey = file.name.slice(0, -5);
      if (!CONTACT.test(contactKey)) throw new Error('MEMORY_MIGRATION_CONTACT_INVALID');
      const state = JSON.parse(fs.readFileSync(path.join(directory, file.name), 'utf8'));
      if (!state || state.version !== 1 || !Array.isArray(state.entries)) throw new Error('MEMORY_MIGRATION_SOURCE_INVALID');
      for (const entry of state.entries) {
        validateEntry(entry, contactKey);
        insertEntry(db, contactKey, entry);
        event(db, contactKey, entry.id, 'migrated', { source: file.name, status: entry.status });
      }
    }
    const rows = db.prepare('SELECT contact_key,id,status,data_json FROM memories').all();
    for (const row of rows) {
      const source = manifest.find(file => file.name === row.contact_key + '.json');
      if (!source) continue;
      const state = JSON.parse(fs.readFileSync(path.join(directory, source.name), 'utf8'));
      const expected = state.entries.find(entry => entry.id === row.id);
      if (!expected || expected.status !== row.status || JSON.stringify(expected) !== row.data_json) {
        throw new Error('MEMORY_MIGRATION_VERIFY_FAILED');
      }
    }
    db.prepare('INSERT INTO memory_meta(key,value) VALUES (?,?)').run('legacy_json_migrated',
      JSON.stringify({ version: SCHEMA_VERSION, at: new Date().toISOString(), manifest }));
    db.exec('COMMIT');
    db.close();
    return { migrated: true, version: SCHEMA_VERSION, contacts: manifest.length,
      entries: rows.length, manifest };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    throw error;
  }
}

function load(db, contactKey) {
  if (!CONTACT.test(contactKey)) throw new Error('MEMORY_CONTACT_INVALID');
  return db.prepare('SELECT data_json FROM memories WHERE contact_key=? ORDER BY rowid').all(contactKey)
    .map(row => JSON.parse(row.data_json));
}

function revisionOf(db, contactKey) {
  return db.prepare('SELECT revision FROM memory_contact_versions WHERE contact_key=?').get(contactKey)?.revision ?? 0;
}

function bumpRevision(db, contactKey) {
  const next = revisionOf(db, contactKey) + 1;
  db.prepare('INSERT INTO memory_contact_versions(contact_key,revision) VALUES (?,?) ON CONFLICT(contact_key) DO UPDATE SET revision=excluded.revision')
    .run(contactKey, next);
  return next;
}

function writeEntries(db, contactKey, entries, action) {
  db.prepare('DELETE FROM memories WHERE contact_key=?').run(contactKey);
  for (const entry of entries) {
    validateEntry(entry, contactKey);
    insertEntry(db, contactKey, entry);
  }
  const revision = bumpRevision(db, contactKey);
  event(db, contactKey, null, action, { entries: entries.length, revision });
  return revision;
}

function loadSnapshot(db, contactKey) {
  if (!CONTACT.test(contactKey)) throw new Error('MEMORY_CONTACT_INVALID');
  db.exec('BEGIN');
  try {
    const entries = load(db, contactKey);
    const revision = revisionOf(db, contactKey);
    db.exec('COMMIT');
    return { entries, revision };
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

function save(db, contactKey, entries, action = 'save', expectedRevision) {
  if (!CONTACT.test(contactKey) || !Array.isArray(entries)) throw new Error('MEMORY_STATE_INVALID');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('MEMORY_REVISION_REQUIRED');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (expectedRevision !== revisionOf(db, contactKey)) throw new Error('MEMORY_CONFLICT');
    const revision = writeEntries(db, contactKey, entries, action);
    db.exec('COMMIT');
    return revision;
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

// The mutation callback runs after BEGIN IMMEDIATE and after reading the latest
// revision, so two processes cannot overwrite each other with stale snapshots.
function mutate(db, contactKey, action, callback) {
  if (!CONTACT.test(contactKey)) throw new Error('MEMORY_CONTACT_INVALID');
  db.exec('BEGIN IMMEDIATE');
  try {
    const entries = load(db, contactKey);
    const result = callback(entries);
    const revision = writeEntries(db, contactKey, entries, action);
    db.exec('COMMIT');
    return { result, revision, entries };
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

function ftsCandidates(db, contactKey, query, limit = 5) {
  if (!CONTACT.test(contactKey)) throw new Error('MEMORY_CONTACT_INVALID');
  const value = String(query ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  if (!value || !Number.isInteger(limit) || limit < 1 || limit > 20) return [];
  const terms = [];
  for (const word of value.toLowerCase().match(/[a-z0-9]{3,}/g) || []) terms.push(word);
  for (const run of value.match(/[\u3400-\u9fff]{3,}/g) || []) {
    for (let i = 0; i + 2 < run.length && terms.length < 8; i++) terms.push(run.slice(i, i + 3));
  }
  const cjkShort = [];
  for (const run of value.match(/[\u3400-\u9fff]{2,}/g) || []) {
    for (let i = 0; i + 1 < run.length && cjkShort.length < 6; i++) cjkShort.push(run.slice(i, i + 2));
  }
  let rows = terms.length
    ? db.prepare(`SELECT m.data_json, bm25(memory_fts) AS rank
        FROM memory_fts JOIN memories m ON m.rowid = memory_fts.rowid
        WHERE memory_fts MATCH ? AND m.contact_key = ? AND m.status = 'confirmed'
        ORDER BY rank, m.rowid DESC LIMIT ?`).all(terms.slice(0, 8).map(term => '"' + term.replaceAll('"', '""') + '"').join(' OR '), contactKey, limit)
    : [];
  if (rows.length < limit && cjkShort.length && terms.length === 0) {
    const clauses = cjkShort.map(() => 'text LIKE ? ESCAPE \'\\\'').join(' OR ');
    const params = [contactKey, ...cjkShort.map(term => '%' + term.replace(/[\\%_]/g, '\\$&') + '%')];
    const fallback = db.prepare(`SELECT data_json, 0 AS rank FROM memories
      WHERE contact_key = ? AND status = 'confirmed' AND (${clauses})
      ORDER BY rowid DESC LIMIT ?`).all(...params, limit);
    const seen = new Set(rows.map(row => row.data_json));
    for (const row of fallback) if (!seen.has(row.data_json)) rows.push(row);
    rows = rows.slice(0, limit);
  }
  if (!rows.length && !terms.length && !cjkShort.length) {
    rows = db.prepare(`SELECT data_json, 0 AS rank FROM memories
      WHERE contact_key = ? AND status = 'confirmed' AND text LIKE ? ESCAPE '\\'
      ORDER BY rowid DESC LIMIT ?`).all(contactKey, '%' + value.replace(/[\\%_]/g, '\\$&') + '%', limit);
  }
  return rows.map(row => ({ ...JSON.parse(row.data_json), rank: Number(row.rank), retrieval: 'fts5' }));
}

module.exports = { DB_NAME, SCHEMA_VERSION, open, migrate, load, loadSnapshot, ftsCandidates, rebuildFts,
  save, mutate, event, revisionOf, dbFile };
