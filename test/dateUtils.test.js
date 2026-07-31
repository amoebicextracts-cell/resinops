import test from 'node:test';
import assert from 'node:assert/strict';

import { daysUntil, parseDateLocal, todayLocalISO } from '../src/lib/dateUtils.js';

test('parseDateLocal parses bare YYYY-MM-DD strings as local calendar dates, not UTC', () => {
  const d = parseDateLocal('2026-08-15');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 15);
});

test('todayLocalISO returns a well-formed YYYY-MM-DD string', () => {
  assert.match(todayLocalISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('daysUntil is negative for a past date, zero for today, positive for a future date', () => {
  assert.equal(daysUntil('2026-08-10', '2026-08-15'), -5);
  assert.equal(daysUntil('2026-08-15', '2026-08-15'), 0);
  assert.equal(daysUntil('2026-08-20', '2026-08-15'), 5);
});
