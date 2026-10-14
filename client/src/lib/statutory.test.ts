import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPLOYER_SSNIT_RATE, payeSchedule, ssnitSchedule } from './statutory';
import type { PayrollLine } from './payroll';

const line = (over: Partial<PayrollLine>): PayrollLine => ({
  workerId: 'w', name: 'A', workerType: 'casual', siteName: 'X', jobTitle: 'Mason', rate: 100, daysPresent: 10, fixed: false,
  gross: 1000, ssnit: 55, tax: 94.5, advances: 0, loans: 0, otherDeductions: 0, totalDeductions: 149.5, net: 850.5,
  overdrawn: false, nationalId: 'GHA-1', bankName: '', accountSite: '-', accountNumber: '-', ...over,
});

test('SSNIT: employee 5.5% from the pay line, employer 13% of gross, total 18.5%', () => {
  const { rows, totals } = ssnitSchedule([line({})]);
  assert.equal(EMPLOYER_SSNIT_RATE, 0.13);
  assert.deepEqual(rows[0], { name: 'A', nationalId: 'GHA-1', gross: 1000, employee: 55, employer: 130, total: 185 });
  assert.deepEqual(totals, { gross: 1000, employee: 55, employer: 130, total: 185 });
});

test('PAYE: taxable pay is gross less SSNIT, and the tax is the pay line\'s own', () => {
  const { rows, totals } = payeSchedule([line({})]);
  assert.deepEqual(rows[0], { name: 'A', nationalId: 'GHA-1', gross: 1000, ssnit: 55, taxable: 945, tax: 94.5 });
  assert.deepEqual(totals, { gross: 1000, ssnit: 55, taxable: 945, tax: 94.5 });
});

test('workers with no earnings are left off both schedules', () => {
  const idle = line({ workerId: 'z', name: 'Z', gross: 0, ssnit: 0, tax: 0, net: 0 });
  assert.equal(ssnitSchedule([idle]).rows.length, 0);
  assert.equal(payeSchedule([idle]).rows.length, 0);
});

test('rows are alphabetical and totals add up exactly', () => {
  const lines = [line({ workerId: '2', name: 'Bea', gross: 333.33, ssnit: 18.33, tax: 31.5 }), line({ workerId: '1', name: 'Abe', gross: 666.67, ssnit: 36.67, tax: 63 })];
  const s = ssnitSchedule(lines);
  assert.deepEqual(s.rows.map((r) => r.name), ['Abe', 'Bea']);
  assert.equal(s.totals.gross, 1000);
  assert.equal(s.totals.employee, 55);
  assert.equal(payeSchedule(lines).totals.tax, 94.5);
});
