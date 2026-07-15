import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenizeInlineMarkdown } from '../src/lib/markdown.js';

test('inline markdown produces typed text tokens', () => {
  assert.deepEqual(tokenizeInlineMarkdown('Use **clean** `tools` and *care*.'), [
    { type: 'text', value: 'Use ' },
    { type: 'strong', value: 'clean' },
    { type: 'text', value: ' ' },
    { type: 'code', value: 'tools' },
    { type: 'text', value: ' and ' },
    { type: 'em', value: 'care' },
    { type: 'text', value: '.' },
  ]);
});

test('HTML from AI output remains inert text instead of executable markup', () => {
  const attack = '<img src=x onerror="globalThis.pwned=true"> **alert**';
  const tokens = tokenizeInlineMarkdown(attack);
  assert.deepEqual(tokens[0], { type: 'text', value: '<img src=x onerror="globalThis.pwned=true"> ' });
  assert.deepEqual(tokens[1], { type: 'strong', value: 'alert' });
  assert.equal(tokens.some(token => token.type === 'html'), false);
});
