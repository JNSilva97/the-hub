import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, validDay, readDay, readSettings, firstDay, smokeFreeStreak, recentDays, savings, pastCutoff, defaultSettings } from '../habits-model.mjs';

const days = entries => new Map(entries.map(([day, cigarettes, coffees = 0]) => [day, { cigarettes, coffees }]));

test('calendar days cross month and year boundaries and reject impossible dates', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(validDay('2026-02-29'), false);
  assert.equal(validDay('2026-11-16'), true);
  assert.equal(validDay('settings'), false);
});

test('day records and settings are validated', () => {
  assert.deepEqual(readDay({ version: 1, coffees: 2 }), { cigarettes: 0, coffees: 2 });
  assert.throws(() => readDay({ cigarettes: -1 }));
  assert.throws(() => readDay({ coffees: 1.5 }));
  assert.deepEqual(readSettings(undefined), defaultSettings);
  assert.equal(readSettings({ version: 1, pouchPrice: 9.5, pouchCigarettes: 45, baseline: 10 }).pouchPrice, 9.5);
  assert.throws(() => readSettings({ coffeeCutoff: '25:00' }));
  assert.throws(() => readSettings({ pouchCigarettes: 0 }));
});

test('smoke-free streak counts back from today and remembers the best run', () => {
  const today = '2026-11-16';
  assert.deepEqual(smokeFreeStreak(new Map(), today), { current: 1, best: 1 });
  const history = days([['2026-11-08', 4], ['2026-11-12', 1], ['2026-11-14', 0, 2]]);
  assert.equal(firstDay(history, today), '2026-11-08');
  // 9, 10, 11 smoke-free (3), 12 smoked, 13-16 smoke-free (4).
  assert.deepEqual(smokeFreeStreak(history, today), { current: 4, best: 4 });
  history.set(today, { cigarettes: 1, coffees: 0 });
  assert.deepEqual(smokeFreeStreak(history, today), { current: 0, best: 3 });
});

test('recent days list today first and fill gaps with zeros', () => {
  const rows = recentDays(days([['2026-11-15', 2, 3]]), new Map([['2026-11-16', 1]]), '2026-11-16', 3);
  assert.deepEqual(rows, [
    { day: '2026-11-16', cigarettes: 0, coffees: 0, lozenges: 1 },
    { day: '2026-11-15', cigarettes: 2, coffees: 3, lozenges: 0 },
    { day: '2026-11-14', cigarettes: 0, coffees: 0, lozenges: 0 }
  ]);
});

test('savings need complete settings and only count tracked days below the baseline', () => {
  const rows = recentDays(days([['2026-11-14', 3], ['2026-11-15', 12]]), new Map(), '2026-11-16', 7);
  assert.equal(savings(rows, defaultSettings, '2026-11-14'), null);
  const settings = { ...defaultSettings, pouchPrice: 10, pouchCigarettes: 50, baseline: 10 };
  // 14th: 7 avoided, 15th: 0 (above baseline), 16th: 10 avoided = 17 cigarettes at €0.20.
  assert.equal(savings(rows, settings, '2026-11-14').toFixed(2), '3.40');
});

test('coffee cut-off compares Lisbon clock times', () => {
  assert.equal(pastCutoff('15:00', '14:59'), false);
  assert.equal(pastCutoff('15:00', '15:00'), true);
  assert.equal(pastCutoff(null, '23:00'), false);
});
