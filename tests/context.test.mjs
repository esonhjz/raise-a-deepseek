import test from 'node:test';
import assert from 'node:assert/strict';
import { timeContextOf } from '../src/time.mjs';
import { summarizeContext } from '../src/context.mjs';

test('time context names the date, weekday, clock, slot and day kind', () => {
  assert.equal(timeContextOf(new Date(2026, 9, 23, 21, 5)), '现在是 2026年10月23日 星期五 21:05，晚上，工作日。');
  assert.match(timeContextOf(new Date(2026, 9, 24, 8, 30)), /星期六 08:30，早上，周末/);
  assert.equal(timeContextOf(new Date('nope')), '');
});

test('context handoff keeps the last exchanges verbatim', () => {
  const history = [
    { user: '旧的一问', assistant: '旧的一答' },
    { user: '第二问', assistant: '第二答' },
    { user: '第三问', assistant: '第三答' },
    { user: '第四问', assistant: '第四答' },
  ];
  const text = summarizeContext(history);
  assert.doesNotMatch(text, /旧的一问/);
  assert.match(text, /对方：第二问/);
  assert.match(text, /你：第四答/);
  assert.ok([...summarizeContext(history, { limit: 40 })].length <= 41);
});
