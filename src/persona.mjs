import { timeContextOf } from './time.mjs';

// A base card says who she is, how she speaks and where the edges are. It does
// not name itself and does not invent a current time; those are runtime facts.
export function composePersona({ card, name = '', now = new Date(), timeContext = '', rules = [] }) {
  const body = String(card ?? '').trim();
  if (!body) throw new Error('CARD_EMPTY');
  const parts = [body];
  if (name) parts.push(`你的名字是“${name}”。`);
  const time = timeContext || timeContextOf(now);
  if (time) parts.push(time);
  for (const rule of rules) {
    const value = String(rule ?? '').trim();
    if (value) parts.push(value);
  }
  return parts.join('\n');
}
