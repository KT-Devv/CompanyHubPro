import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceBySite, attendanceTrend, eachDay, topMovers } from './insights';

test('eachDay covers both ends and crosses month boundaries', () => {
  assert.deepEqual(eachDay('2026-01-30', '2026-02-02'), ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  assert.deepEqual(eachDay('2026-03-05', '2026-03-05'), ['2026-03-05']);
});

test('attendance trend: one point per day, half days count as half, empty days have no rate', () => {
  const rows = [
    { worker_id: 'a', date: '2026-03-02', status: 'Present' as const },
    { worker_id: 'b', date: '2026-03-02', status: 'Half Day' as const },
    { worker_id: 'c', date: '2026-03-02', status: 'Absent' as const },
    { worker_id: 'd', date: '2026-03-02', status: 'Leave' as const },
    { worker_id: 'a', date: '2026-03-04', status: 'Present' as const },
    { worker_id: 'z', date: '2026-02-20', status: 'Present' as const }, // outside the range
  ];
  const trend = attendanceTrend(rows, '2026-03-01', '2026-03-04');
  assert.equal(trend.length, 4);
  const [d1, d2, d3, d4] = trend;
  assert.equal(d1.rate, null);
  assert.deepEqual({ p: d2.present, a: d2.absent, l: d2.leave, m: d2.marked }, { p: 2, a: 1, l: 1, m: 4 });
  assert.equal(d2.rate, 37.5); // (1 + 0.5) / 4
  assert.equal(d3.marked, 0);
  assert.equal(d4.rate, 100);
});

test('attendance by site groups workers without a site', () => {
  const rows = [
    { worker_id: 'a', date: 'x', status: 'Present' as const },
    { worker_id: 'b', date: 'x', status: 'Absent' as const },
    { worker_id: 'c', date: 'x', status: 'Half Day' as const },
    { worker_id: 'd', date: 'x', status: 'Leave' as const },
  ];
  const sites = new Map<string, string | null>([['a', 's1'], ['b', 's1'], ['c', null], ['d', 's2']]);
  const names = new Map([['s1', 'Accra'], ['s2', 'Tema']]);
  const bars = attendanceBySite(rows, sites, names);
  assert.deepEqual(bars.find((b) => b.site === 'Accra'), { site: 'Accra', present: 1, absent: 1, leave: 0 });
  assert.deepEqual(bars.find((b) => b.site === 'No site'), { site: 'No site', present: 1, absent: 0, leave: 0 });
  assert.equal(bars.find((b) => b.site === 'Tema')?.leave, 1);
});

test('top movers sums by item and sorts descending', () => {
  const rows = [
    { quantity: 5, inventory: { item_name: 'Cement' } },
    { quantity: 20, inventory: { item_name: 'Sand' } },
    { quantity: 30, inventory: { item_name: 'Cement' } },
    { quantity: 1, inventory: null },
  ];
  assert.deepEqual(topMovers(rows, 2), [{ name: 'Cement', quantity: 35 }, { name: 'Sand', quantity: 20 }]);
});
