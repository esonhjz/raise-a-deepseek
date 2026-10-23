import test from 'node:test';
import assert from 'node:assert/strict';
import { composePersona } from '../src/persona.mjs';

test('the card is kept, and name plus time are appended by the runtime', () => {
  const prompt = composePersona({ card: '你真名：DeepSeek。', name: '大肥鱼', now: new Date(2026, 9, 23, 21, 5), rules: ['说话要短。'] });
  const lines = prompt.split('\n');
  assert.equal(lines[0], '你真名：DeepSeek。');
  assert.match(prompt, /你的名字是“大肥鱼”。/);
  assert.match(prompt, /2026年10月23日 星期五 21:05/);
  assert.match(prompt, /说话要短。/);
});

test('an empty card is refused', () => {
  assert.throws(() => composePersona({ card: '  ' }), /CARD_EMPTY/);
});
