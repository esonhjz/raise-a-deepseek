import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const FOLDERS = { her: 'letters', mother: 'replies', room: 'room' };

function folderFor(to) {
  return FOLDERS[to] || 'replies';
}

export class Lane {
  constructor(home) {
    this.home = home;
    for (const folder of Object.values(FOLDERS)) fs.mkdirSync(path.join(home, folder), { recursive: true });
  }

  send({ from = 'mother', to = 'her', text, kind = 'letter', replyTo = null }) {
    const body = String(text ?? '').trim();
    if (!body) throw new Error('LETTER_TEXT_EMPTY');
    if ([...body].length > 4000) throw new Error('LETTER_TOO_LONG');
    if (to !== 'her' && from === 'mother') from = 'her';
    const message = { id: randomUUID(), from, to, kind: kind === 'note' ? 'note' : 'letter',
      replyTo: replyTo || null, time: new Date().toISOString(), text: body, seen: false, seenAt: null };
    const folder = folderFor(to);
    const directory = path.join(this.home, folder);
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, message.time.replace(/[:.]/g, '-') + '-' + message.id.slice(0, 8) + '.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(message, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    return { ...message, file };
  }

  list(folder) {
    const directory = path.join(this.home, folder);
    if (!fs.existsSync(directory)) return [];
    const letters = [];
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      if (name.endsWith('.json')) {
        try {
          const value = JSON.parse(fs.readFileSync(file, 'utf8'));
          letters.push({ ...value, file, seen: value.seen === true || value.read === true });
        } catch {}
      } else if (name.endsWith('.md')) {
        const text = fs.readFileSync(file, 'utf8').trim();
        if (!text || [...text].length > 2000) continue;
        letters.push({ id: 'md:' + name, file, from: 'mother', to: 'her', kind: 'letter', replyTo: null,
          time: fs.statSync(file).mtime.toISOString(), text, seen: fs.existsSync(file + '.read') });
      }
    }
    return letters.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  unread(folder = 'letters', limit = 2) {
    return this.list(folder).filter(letter => letter.seen !== true).slice(0, limit);
  }

  markSeen(ids, folder = 'letters') {
    const wanted = new Set(ids);
    for (const letter of this.list(folder)) {
      if (!wanted.has(letter.id)) continue;
      if (String(letter.id).startsWith('md:')) {
        fs.writeFileSync(letter.file + '.read', new Date().toISOString() + '\n', { mode: 0o600 });
        continue;
      }
      fs.writeFileSync(letter.file, JSON.stringify({ ...letter, seen: true, seenAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
    }
  }

  check() {
    const toHer = this.unread('letters', 5);
    const toMe = this.unread('replies', 5);
    const room = this.unread('room', 5);
    const brief = item => ({ id: item.id, from: item.from, kind: item.kind, time: item.time, text: item.text });
    return {
      summary: `unread to her: ${toHer.length}, unread to me: ${toMe.length}, at the door: ${room.length}`,
      toHer: toHer.map(brief),
      toMe: toMe.map(brief),
      room: room.map(brief),
    };
  }
}
