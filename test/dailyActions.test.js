import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMonthGrid, groupActionsByDay, toISODate } from '../src/lib/dailyActions.js';

test('toISODate formats a noon-anchored date as YYYY-MM-DD', () => {
  assert.equal(toISODate(new Date(2026, 6, 31, 12)), '2026-07-31');
});

test('groupActionsByDay buckets same-day actions together, preserving input order', () => {
  const actions = [
    { id: 'a1', date: '2026-08-03', label: 'Harvest' },
    { id: 'a2', date: '2026-08-01', label: 'Transplant' },
    { id: 'a3', date: '2026-08-03', label: 'Package' },
  ];
  const grouped = groupActionsByDay(actions);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].date, '2026-08-01');
  assert.equal(grouped[1].date, '2026-08-03');
  assert.deepEqual(grouped[1].items.map(i => i.id), ['a1', 'a3']);
});

test('groupActionsByDay returns an empty array for empty input and skips actions with no date', () => {
  assert.deepEqual(groupActionsByDay([]), []);
  assert.deepEqual(groupActionsByDay([{ id: 'x', date: null, label: 'no date' }]), []);
});

test('buildMonthGrid aligns the 1st of the month to the correct weekday column', () => {
  // August 2026: Aug 1 is a Saturday (getDay() === 6)
  const { weeks, monthLabel } = buildMonthGrid(2026, 7, [], '2026-08-15');
  assert.equal(monthLabel, 'August 2026');
  assert.equal(weeks[0].length, 7);
  const day1Index = weeks[0].findIndex(c => c.date === '2026-08-01');
  assert.equal(day1Index, new Date(2026, 7, 1).getDay());
  for (let i = 0; i < day1Index; i++) {
    assert.equal(weeks[0][i].inMonth, false);
    assert.equal(weeks[0][i].date, null);
  }
});

test('buildMonthGrid pads trailing weeks to a full 7 columns and marks isToday only on the matching in-month cell', () => {
  const { weeks } = buildMonthGrid(2026, 7, [], '2026-08-01');
  const lastWeek = weeks[weeks.length - 1];
  assert.equal(lastWeek.length, 7);
  const todayCells = weeks.flat().filter(c => c.isToday);
  assert.equal(todayCells.length, 1);
  assert.equal(todayCells[0].date, '2026-08-01');
  assert.equal(todayCells[0].inMonth, true);
});

test('buildMonthGrid never marks a leading/trailing blank cell as today even if it would numerically coincide', () => {
  // Use a todayISO that can't exist in August (Feb 30) to isolate the blank-cell guard itself:
  // blank cells always carry date:null, so they can never equality-match any real ISO string.
  const { weeks } = buildMonthGrid(2026, 7, [], null);
  const blanks = weeks.flat().filter(c => !c.inMonth);
  assert.ok(blanks.length > 0);
  assert.ok(blanks.every(c => c.isToday === false && c.date === null));
});

test('buildMonthGrid attaches grouped actions to the correct day cell', () => {
  const grouped = groupActionsByDay([
    { id: 'a1', date: '2026-08-10', label: 'Flip to flower' },
    { id: 'a2', date: '2026-08-10', label: 'Harvest' },
  ]);
  const { weeks } = buildMonthGrid(2026, 7, grouped, '2026-08-01');
  const cell = weeks.flat().find(c => c.date === '2026-08-10');
  assert.equal(cell.items.length, 2);
  assert.deepEqual(cell.items.map(i => i.id), ['a1', 'a2']);
  const otherCell = weeks.flat().find(c => c.date === '2026-08-11');
  assert.deepEqual(otherCell.items, []);
});
