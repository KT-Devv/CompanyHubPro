import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, migrate, CHAIN } from './harness.mjs';

test('the full migration chain runs on a fresh database', async () => {
  const db = await bootstrap();
  await migrate(db);
});

test('every migration after the base setup is safe to run again', async () => {
  const db = await bootstrap();
  await migrate(db);
  await migrate(db, CHAIN.slice(1));
});

test('the tables the app depends on all exist, with row-level security on', async () => {
  const db = await bootstrap();
  await migrate(db);
  const { rows } = await db.query(`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`);
  const rls = Object.fromEntries(rows.map((r) => [r.relname, r.relrowsecurity]));
  for (const t of [
    'users', 'workers', 'attendance', 'inventory', 'goods_log', 'invoices', 'worker_transfers',
    'salary_advances', 'loans', 'deductions', 'app_settings', 'audit_log',
    'payroll_periods', 'payroll_lines', 'payroll_reopens',
  ]) {
    assert.ok(t in rls, `${t} does not exist`);
    assert.equal(rls[t], true, `${t} has no row-level security`);
  }
});
