import test from 'node:test';
import assert from 'node:assert/strict';
import { bankFileRows, cleanAccountNumber, isValidAccountNumber, narrationFor, prepareBankPayments } from './bank-file';
import type { PayrollLine } from './payroll';

const line = (over: Partial<PayrollLine> = {}): PayrollLine => ({
  workerId: 'w1', name: 'Kwame Mensah', workerType: 'casual', siteName: 'Accra', jobTitle: 'Mason', rate: 100,
  daysPresent: 20, fixed: false, gross: 2000, ssnit: 110, tax: 189, advances: 0, loans: 0, otherDeductions: 0,
  totalDeductions: 299, net: 1701, overdrawn: false, nationalId: 'GHA-1', bankName: 'GCB Bank',
  accountSite: 'Accra', accountNumber: '1020304050', ...over,
});

test('a worker with a good account is paid their net amount', () => {
  const plan = prepareBankPayments([line()], '2026-09');
  assert.equal(plan.payments.length, 1);
  assert.deepEqual(plan.payments[0], {
    workerId: 'w1', name: 'Kwame Mensah', bankName: 'GCB Bank', accountNumber: '1020304050',
    amount: 1701, narration: 'Salary Sep 2026', reference: 'SAL-202609-001',
  });
  assert.equal(plan.total, 1701);
  assert.deepEqual(plan.skipped, []);
});

test('everyone who cannot be paid is listed with the reason, not silently dropped', () => {
  const plan = prepareBankPayments([
    line({ workerId: 'a', name: 'No Account', accountNumber: '-' }),
    line({ workerId: 'b', name: 'Bad Account', accountNumber: '12AB' }),
    line({ workerId: 'c', name: 'No Bank', bankName: '' }),
    line({ workerId: 'd', name: 'Owes Money', net: 0, overdrawn: true }),
    line({ workerId: 'e', name: 'Fine' }),
  ], '2026-09');
  assert.deepEqual(plan.skipped.map((s) => [s.name, s.reason]).sort(), [
    ['Bad Account', 'bad_account'], ['No Account', 'no_account'], ['No Bank', 'no_bank'], ['Owes Money', 'nothing_to_pay'],
  ]);
  assert.deepEqual(plan.payments.map((p) => p.name), ['Fine']);
});

test('spaces and hyphens in an account number are removed', () => {
  assert.equal(cleanAccountNumber('1020 3040-50'), '1020304050');
  const plan = prepareBankPayments([line({ accountNumber: '1020 3040-50' })], '2026-09');
  assert.equal(plan.payments[0].accountNumber, '1020304050');
});

test('account numbers must be 8-20 digits', () => {
  for (const ok of ['12345678', '12345678901234567890']) assert.equal(isValidAccountNumber(ok), true, ok);
  for (const bad of ['1234567', '123456789012345678901', 'ABCDEFGH12', '1234.5678', '']) assert.equal(isValidAccountNumber(bad), false, bad);
});

test('references are unique and in order; the total adds up to the pesewa', () => {
  const plan = prepareBankPayments([
    line({ workerId: 'b', name: 'B', net: 100.1 }), line({ workerId: 'a', name: 'A', net: 200.2 }), line({ workerId: 'c', name: 'C', net: 0.3 }),
  ], '2026-01');
  assert.deepEqual(plan.payments.map((p) => [p.name, p.reference]), [['A', 'SAL-202601-001'], ['B', 'SAL-202601-002'], ['C', 'SAL-202601-003']]);
  assert.equal(plan.total, 300.6);
  assert.equal(new Set(plan.payments.map((p) => p.reference)).size, 3);
});

test('totals are grouped by bank', () => {
  const plan = prepareBankPayments([
    line({ workerId: 'a', bankName: 'GCB Bank', net: 100 }), line({ workerId: 'b', bankName: 'GCB Bank', net: 50.5 }), line({ workerId: 'c', bankName: 'Ecobank', net: 10 }),
  ], '2026-09');
  assert.deepEqual(plan.byBank, [{ bank: 'Ecobank', count: 1, total: 10 }, { bank: 'GCB Bank', count: 2, total: 150.5 }]);
});

test('the file has a header row and amounts to two decimals', () => {
  const rows = bankFileRows(prepareBankPayments([line({ net: 12.5 })], '2026-09').payments);
  assert.deepEqual(rows[0], ['Beneficiary name', 'Bank', 'Account number', 'Amount', 'Narration', 'Reference']);
  assert.equal(rows[1][3], '12.50');
});

test('the narration names the month', () => {
  assert.equal(narrationFor('2026-12'), 'Salary Dec 2026');
});
