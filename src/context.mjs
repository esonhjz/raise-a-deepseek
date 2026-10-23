function clip(text, limit) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return [...value].length > limit ? [...value].slice(0, limit).join('') + '…' : value;
}

// Turn the last few exchanges into a short handoff. Deliberately verbatim: a
// summary that invents causes is worse than no summary at all.
export function summarizeContext(history, { pairs = 3, perMessage = 80, limit = 700 } = {}) {
  if (!Array.isArray(history) || !history.length) return '';
  const lines = [];
  for (const pair of history.slice(-pairs)) {
    if (typeof pair?.user === 'string' && pair.user.trim()) lines.push('对方：' + clip(pair.user, perMessage));
    if (typeof pair?.assistant === 'string' && pair.assistant.trim()) lines.push('你：' + clip(pair.assistant, perMessage));
  }
  const text = lines.join('\n');
  return [...text].length > limit ? [...text].slice(0, limit).join('') + '…' : text;
}
