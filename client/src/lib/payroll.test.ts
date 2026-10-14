import test from 'node:test';
import assert from 'node:assert/strict';
import { computePayroll, dayCredit, totalPayroll, SSNIT_RATE, TAX_RATE } from './payroll';

const casual = (id: string, rate: number, extra = {}) => ({
  id,
  name: `Worker ${id}`,
  worker_type: 'casual',
  portfolios: { portfolio_name: 'Mason', rate },
  site: { site_name: 'Accra' },
  ...extra,
});
const office = (id: string, rate: number) => ({
  id,
  name: `Office ${id}`,
  worker_type: 'non_marking',
  positions: { position_name: 'Accountant', rate },
});
const none = { attendance: [], advances: [], loans: [], deductions: [] };

test('a half day counts 0.5, absent and leave count 0', () => {
  assert.equal(dayCredit('Present'), 1);
  assert.equal(dayCredit('Half Day'), 0.5);
  assert.equal(dayCredit('Absent'), 0);
  assert.equal(dayCredit('Leave'), 0);
});

test('casual pay = days x rate, with SSNIT then tax on the remainder', () => {
  const [line] = computePayroll({
    workers: [casual('a', 120)],
    ...none,
    attendance: [
      ...Array.from({ length: 13 }, () => ({ worker_id: 'a', status: 'Present' })),
      { worker_id: 'a', status: 'Half Day' },
    ],
  });
  assert.equal(line.daysPresent, 13.5);
  assert.equal(line.gross, 1620);
  assert.equal(line.ssnit, 89.1); // 5.5% of 1620
  assert.equal(line.tax, 153.09); // 10% of (1620 - 89.10)
  assert.equal(line.net, 1377.81);
  assert.equal(SSNIT_RATE, 0.055);
  assert.equal(TAX_RATE, 0.1);
});

test('an exact half-pesewa rounds up, as it does in the database (rate 321 x 10 days)', () => {
  // gross 3210.00, SSNIT 176.55, tax = (3210 - 176.55) * 10% = 303.345 exactly.
  const [line] = computePayroll({
    workers: [casual('a', 321)],
    attendance: Array.from({ length: 10 }, () => ({ worker_id: 'a', status: 'Present' })),
    advances: [], loans: [], deductions: [],
  });
  assert.equal(line.ssnit, 176.55);
  assert.equal(line.tax, 303.35);
  assert.equal(line.net, 2730.1);
});

test('advances, loans and other deductions come off net pay', () => {
  const [line] = computePayroll({
    workers: [casual('a', 100)],
    attendance: Array.from({ length: 10 }, () => ({ worker_id: 'a', status: 'Present' })),
    advances: [{ worker_id: 'a', amount: 100 }, { worker_id: 'a', amount: 50 }],
    loans: [{ worker_id: 'a', amount: 200 }],
    deductions: [{ worker_id: 'a', amount: 25 }],
  });
  assert.equal(line.advances, 150);
  assert.equal(line.loans, 200);
  assert.equal(line.otherDeductions, 25);
  assert.equal(line.totalDeductions, 55 + 94.5 + 150 + 200 + 25); // ssnit 55, tax 94.5
  assert.equal(line.net, 1000 - line.totalDeductions);
  assert.equal(line.overdrawn, false);
});

test("other workers' attendance and entries don't leak into a worker's pay", () => {
  const lines = computePayroll({
    workers: [casual('a', 100), casual('b', 100)],
    attendance: [{ worker_id: 'a', status: 'Present' }],
    advances: [{ worker_id: 'a', amount: 10 }],
    loans: [],
    deductions: [],
  });
  const b = lines.find((l) => l.workerId === 'b')!;
  assert.equal(b.daysPresent, 0);
  assert.equal(b.gross, 0);
  assert.equal(b.advances, 0);
});

test('net pay never goes below zero, and the shortfall is flagged', () => {
  const [line] = computePayroll({
    workers: [casual('a', 100)],
    attendance: [{ worker_id: 'a', status: 'Present' }],
    advances: [{ worker_id: 'a', amount: 500 }],
    loans: [],
    deductions: [],
  });
  assert.equal(line.net, 0);
  assert.equal(line.overdrawn, true);
});

test('non-marking staff get their position rate regardless of attendance', () => {
  const [line] = computePayroll({ workers: [office('o', 4200)], ...none });
  assert.equal(line.fixed, true);
  assert.equal(line.daysPresent, 0);
  assert.equal(line.gross, 4200);
});

test('workers of an unknown (legacy) type are left out', () => {
  const lines = computePayroll({ workers: [{ id: 'x', name: 'Old', worker_type: 'office' }, casual('a', 100)], ...none });
  assert.deepEqual(lines.map((l) => l.workerId), ['a']);
});

test('a missing rate or name does not produce NaN', () => {
  const [line] = computePayroll({ workers: [{ id: 'a', name: null, worker_type: 'casual', portfolios: null }], ...none });
  assert.equal(line.name, '');
  assert.equal(line.gross, 0);
  assert.equal(Number.isNaN(line.net), false);
});

test('totals add up the lines', () => {
  const lines = computePayroll({
    workers: [casual('a', 100), casual('b', 50)],
    attendance: [{ worker_id: 'a', status: 'Present' }, { worker_id: 'b', status: 'Present' }],
    advances: [], loans: [], deductions: [],
  });
  const t = totalPayroll(lines);
  assert.equal(t.workers, 2);
  assert.equal(t.gross, 150);
  assert.equal(t.net, Math.round((lines[0].net + lines[1].net) * 100) / 100);
});
