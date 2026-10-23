import path from 'node:path';
import { MemoryStore } from '../src/memory.mjs';

function option(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? '';
}

const home = path.join(process.cwd(), 'data', 'home');
const store = new MemoryStore(path.join(home, 'memory'), option('--key', 'default'));
const query = option('--query');
console.log(JSON.stringify({ status: 'ok', entries: query ? store.recall(query) : store.all() }, null, 2));
