export function tokenizeInlineMarkdown(text) {
  const input = String(text ?? '');
  const tokens = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
  let cursor = 0;
  for (const match of input.matchAll(pattern)) {
    if (match.index > cursor) tokens.push({ type: 'text', value: input.slice(cursor, match.index) });
    const raw = match[0];
    if (raw.startsWith('**')) tokens.push({ type: 'strong', value: raw.slice(2, -2) });
    else if (raw.startsWith('`')) tokens.push({ type: 'code', value: raw.slice(1, -1) });
    else tokens.push({ type: 'em', value: raw.slice(1, -1) });
    cursor = match.index + raw.length;
  }
  if (cursor < input.length) tokens.push({ type: 'text', value: input.slice(cursor) });
  return tokens;
}
