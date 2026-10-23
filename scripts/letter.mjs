import path from 'node:path';
import { Lane } from '../src/lane.mjs';

function option(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? '';
}

const home = path.join(process.cwd(), 'data', 'home');
const to = option('--to', 'her');
const text = option('--text');
try {
  const lane = new Lane(home);
  const letter = lane.send({ from: option('--from', 'mother'), to, text, replyTo: option('--reply-to') || null });
  console.log(JSON.stringify({ status: 'ok', id: letter.id, to, file: letter.file }));
} catch (error) {
  console.error(JSON.stringify({ status: 'error', reason: error.message }));
  process.exitCode = 1;
}
