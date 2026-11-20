import test from 'node:test';
import assert from 'node:assert/strict';
import { readCalendarRecord, plansForDay, weekDates, weekday, lisbonDay, routineRelevant } from '../calendar-model.mjs';

const record = (plans, mode = 'custom', revision = 1) => ({ version: 1, revision, mode, plans });
test('Calendar uses Lisbon dates and Monday-first weeks across year boundaries', () => {
  assert.equal(lisbonDay(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
  assert.deepEqual(weekDates('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(weekday('2026-11-22'), 7);
});
test('Date overrides, explicit free days and following the weekly pattern remain distinct', () => {
  const records = new Map([['repeat-5', record(['office', 'training'])]]);
  assert.deepEqual(plansForDay(records, '2026-11-20'), { day: '2026-11-20', plans: ['office', 'training'], source: 'weekly' });
  assert.deepEqual(plansForDay(records, '2026-11-27').plans, ['office', 'training']);
  records.set('2026-11-20', record(['training']));
  assert.deepEqual(plansForDay(records, '2026-11-20').plans, ['training']);
  records.set('2026-11-20', record([]));
  assert.deepEqual(plansForDay(records, '2026-11-20').plans, []);
  records.set('2026-11-20', record([], 'weekly'));
  assert.deepEqual(plansForDay(records, '2026-11-20').plans, ['office', 'training']);
  assert.deepEqual(plansForDay(records, '2026-11-21').plans, []);
});

test('Retired Going out plans remain readable without appearing or hiding Office and training', () => {
  const old = readCalendarRecord('repeat-5', record(['office', 'training', 'going-out'], 'custom', 8));
  assert.deepEqual(old.plans, ['office', 'training']);
  assert.equal(old.revision, 8);
  assert.deepEqual(readCalendarRecord('2026-11-20', record(['going-out'])).plans, []);
  const records = new Map([['repeat-5', record(['office', 'going-out'])], ['2026-11-20', record(['going-out'])]]);
  assert.deepEqual(plansForDay(records, '2026-11-20').plans, []);
  assert.deepEqual(plansForDay(records, '2026-11-27').plans, ['office']);
});
test('Calendar records reject malformed dates, duplicate or unknown plans, and invalid revisions', () => {
  assert.deepEqual(readCalendarRecord('repeat-5', record(['training', 'office'])).plans, ['office', 'training']);
  for (const [id, value] of [['2026-02-30', record([])], ['repeat-0', record([])], ['repeat-8', record([])],
    ['2026-11-20', record(['gym'])], ['2026-11-20', record(['office', 'office'])], ['2026-11-20', record([], 'bad')],
    ['repeat-5', record([], 'weekly')], ['2026-11-20', record(['office'], 'weekly')], ['2026-11-20', record([], 'custom', 0)],
    ['2026-11-20', record([], 'custom', 1.5)], ['2026-11-20', record([], 'custom', 1000000001)]]) {
    assert.throws(() => readCalendarRecord(id, value));
  }
});
test('Training uses the Muay Thai checklist and daily routines stay relevant', () => {
  for (const name of ['Morning Routine', 'Wind Down']) assert.equal(routineRelevant(name, []), true);
  assert.equal(routineRelevant('Muay Thai Preparation', ['training']), true);
  assert.equal(routineRelevant('Office Preparation', ['training']), false);
  assert.equal(routineRelevant('Getting Ready', ['going-out']), true);
  assert.equal(routineRelevant('Getting Ready', []), false);
});
