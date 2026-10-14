import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { as, freshDb, ID, ITEM, monthsAgo, SITE, STORE, WORKER } from './harness.mjs';

let db;
const PAST = monthsAgo(1);
const CURRENT = monthsAgo(0);

before(async () => {
  db = await freshDb();
  // A finished month of attendance, loaded directly (the marking window stops
  // supervisors back-filling a month through the API).
  const day = (d) => `${PAST}-${String(d).padStart(2, '0')}`;
  for (const [d, status] of [[3, 'Present'], [4, 'Present'], [5, 'Present'], [6, 'Half Day'], [7, 'Absent']]) {
    await db.exec(`INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.casualA}', '${day(d)}', '${status}', '${ID.sup}', 'casual')`);
  }
  await db.exec(`INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.casualB}', '${day(3)}', 'Present', '${ID.sup}', 'casual')`);
  await db.exec(`
    INSERT INTO salary_advances(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 50, '${PAST}', '${day(10)}');
    INSERT INTO loans(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 25, '${PAST}', '${day(10)}');
    INSERT INTO deductions(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 10, '${PAST}', '${day(10)}');
    UPDATE workers SET bank_name = 'GCB Bank', account_number = '1010101010' WHERE id = '${WORKER.casualA}';
  `);
});

const q = async (sql) => (await db.query(sql)).rows;
const q1 = async (sql) => (await q(sql))[0];
const ok = (r) => assert.ok(!r.error, r.error?.message);
const bad = (r, re) => { assert.ok(r.error, 'expected a refusal'); if (re) assert.match(r.error.message, re); };
const line = async (id, m = PAST) => q1(`SELECT * FROM payroll_compute('${m}') WHERE worker_id = '${id}'`);

describe('payroll_compute: the one authoritative calculation', () => {
  test('a casual worker: days x rate, SSNIT 5.5%, tax 10% of the remainder, then the ledger', async () => {
    const l = await line(WORKER.casualA);
    assert.equal(Number(l.days_present), 3.5); // 3 Present + 1 Half Day; Absent counts 0
    assert.equal(Number(l.gross), 350);
    assert.equal(Number(l.ssnit), 19.25);
    assert.equal(Number(l.tax), 33.08);
    assert.deepEqual([Number(l.advances), Number(l.loans), Number(l.other_deductions)], [50, 25, 10]);
    assert.equal(Number(l.total_deductions), 137.33);
    assert.equal(Number(l.net), 212.67);
    assert.equal(l.overdrawn, false);
    assert.deepEqual([l.bank_name, l.account_number, l.site_name, l.job_title], ['GCB Bank', '1010101010', 'A', 'Mason']);
  });
  test('office staff are paid their position rate whatever the attendance', async () => {
    const l = await line(WORKER.officeA);
    assert.deepEqual([l.fixed, Number(l.days_present), Number(l.gross), Number(l.ssnit), Number(l.tax)], [true, 0, 3000, 165, 283.5]);
  });
  test('net never goes below zero and the shortfall is flagged', async () => {
    await db.exec(`INSERT INTO salary_advances(worker_id, amount, month, date) VALUES ('${WORKER.casualB}', 5000, '${PAST}', '${PAST}-12')`);
    const l = await line(WORKER.casualB);
    assert.equal(Number(l.net), 0);
    assert.equal(l.overdrawn, true);
    await db.exec(`DELETE FROM salary_advances WHERE worker_id = '${WORKER.casualB}'`);
  });
  test('one month\'s attendance and entries never leak into another', async () => {
    const l = await line(WORKER.casualA, monthsAgo(2));
    assert.deepEqual([Number(l.days_present), Number(l.advances)], [0, 0]);
  });
});

describe('closing a month', () => {
  test('only the CEO, HR and finance may close; nobody else', async () => {
    for (const who of ['sup', 'pm', 'sys', 'st1', 'logm', 'sec']) bad(await as(db, who, `SELECT rpc_close_payroll('${PAST}')`, undefined), /permission/i);
  });
  test('a month that has not ended cannot be closed, and the format is checked', async () => {
    bad(await as(db, 'fin', `SELECT rpc_close_payroll('${CURRENT}')`), /after it has ended/);
    bad(await as(db, 'fin', `SELECT rpc_close_payroll('2026-13')`), /Month must/);
  });
  test('finance closes it, freezing exactly what payroll_compute says', async () => {
    ok(await as(db, 'fin', `SELECT rpc_close_payroll('${PAST}')`));
    const live = await q(`SELECT * FROM payroll_compute('${PAST}')`);
    const frozen = await q(`SELECT * FROM payroll_lines WHERE month = '${PAST}'`);
    assert.equal(frozen.length, live.length);
    for (const f of frozen) {
      const l = live.find((x) => x.worker_id === f.worker_id);
      assert.equal(Number(f.net), Number(l.net), f.worker_name);
      assert.equal(Number(f.gross), Number(l.gross));
      assert.equal(f.account_number, l.account_number);
    }
    const p = await q1(`SELECT * FROM payroll_periods WHERE month = '${PAST}'`);
    assert.equal(p.closed_by, ID.fin);
    assert.equal(p.workers, frozen.length);
    assert.equal(Number(p.net), Math.round(frozen.reduce((s, f) => s + Number(f.net) * 100, 0)) / 100);
  });
  test('it cannot be closed twice', async () => {
    bad(await as(db, 'fin', `SELECT rpc_close_payroll('${PAST}')`), /already closed/);
  });
  test('the frozen figures do not change when rates, attendance or bank details later do', async () => {
    const before = await q1(`SELECT net, account_number FROM payroll_lines WHERE month = '${PAST}' AND worker_id = '${WORKER.casualA}'`);
    await db.exec(`UPDATE portfolios SET rate = 999; UPDATE workers SET account_number = 'CHANGED' WHERE id = '${WORKER.casualA}'`);
    const after = await q1(`SELECT net, account_number FROM payroll_lines WHERE month = '${PAST}' AND worker_id = '${WORKER.casualA}'`);
    assert.deepEqual(after, before);
    await db.exec(`UPDATE portfolios SET rate = 100; UPDATE workers SET account_number = '1010101010' WHERE id = '${WORKER.casualA}'`);
  });
  test('nobody can write to the payroll tables directly, not even the CEO', async () => {
    assert.equal((await as(db, 'ceo', `UPDATE payroll_lines SET net = 1`)).affectedRows, 0);
    assert.equal((await as(db, 'ceo', `DELETE FROM payroll_lines`)).affectedRows, 0);
    assert.equal((await as(db, 'ceo', `DELETE FROM payroll_periods`)).affectedRows, 0);
    bad(await as(db, 'ceo', `INSERT INTO payroll_periods(month, closed_by) VALUES ('2020-01', '${ID.ceo}')`));
  });
  test('finance roles can read the frozen lines; supervisors cannot', async () => {
    assert.ok((await as(db, 'fin', `SELECT count(*)::int n FROM payroll_lines`)).rows[0].n >= 3);
    assert.equal((await as(db, 'sup', `SELECT count(*)::int n FROM payroll_lines`)).rows[0].n, 0);
    assert.equal((await as(db, 'pm', `SELECT count(*)::int n FROM payroll_periods`)).rows[0].n, 0);
  });
});

describe('a closed month is locked', () => {
  const day = `${PAST}-15`;
  test('no new advance, loan or deduction for that month, from anyone', async () => {
    for (const [who, t] of [['fin', 'salary_advances'], ['hr', 'loans'], ['sys', 'deductions']]) {
      bad(await as(db, who, `INSERT INTO ${t}(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 5, '${PAST}', '${day}')`), /closed/);
    }
  });
  test('existing entries cannot be edited or removed', async () => {
    bad(await as(db, 'fin', `UPDATE salary_advances SET amount = 1 WHERE month = '${PAST}'`), /closed/);
    bad(await as(db, 'fin', `DELETE FROM loans WHERE month = '${PAST}'`), /closed/);
  });
  test('attendance for that month cannot be corrected, deleted or added', async () => {
    bad(await as(db, 'hr', `UPDATE attendance SET status = 'Present' WHERE date = '${PAST}-07'`), /closed/);
    bad(await as(db, 'hr', `DELETE FROM attendance WHERE date = '${PAST}-03'`), /closed/);
    bad(await as(db, 'hr', `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.officeA}', '${PAST}-20', 'Present', '${ID.hr}', 'non_marking')`), /closed/);
  });
  test('moving a record out of a closed month is blocked too', async () => {
    bad(await as(db, 'hr', `UPDATE attendance SET date = '${CURRENT}-01' WHERE date = '${PAST}-03' AND worker_id = '${WORKER.casualB}'`), /closed/);
  });
  test('other months are unaffected', async () => {
    ok(await as(db, 'fin', `INSERT INTO salary_advances(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 5, '${CURRENT}', '${CURRENT}-01')`));
  });
});

describe('reopening a month', () => {
  test('only the CEO, and only with a reason', async () => {
    bad(await as(db, 'fin', `SELECT rpc_reopen_payroll('${PAST}', 'a good reason')`), /Only the CEO/);
    bad(await as(db, 'hr', `SELECT rpc_reopen_payroll('${PAST}', 'a good reason')`), /Only the CEO/);
    bad(await as(db, 'ceo', `SELECT rpc_reopen_payroll('${PAST}', 'no')`), /reason/);
    bad(await as(db, 'ceo', `SELECT rpc_reopen_payroll('2001-01', 'a good reason')`), /not closed/);
  });
  test('the CEO reopens it; the reason and the frozen lines are kept on record', async () => {
    ok(await as(db, 'ceo', `SELECT rpc_reopen_payroll('${PAST}', 'Wrong rate on one portfolio')`));
    assert.equal((await q(`SELECT 1 FROM payroll_periods WHERE month = '${PAST}'`)).length, 0);
    const r = await q1(`SELECT * FROM payroll_reopens WHERE month = '${PAST}'`);
    assert.deepEqual([r.reopened_by, r.reason], [ID.ceo, 'Wrong rate on one portfolio']);
    const logged = await q(`SELECT old_data FROM audit_log WHERE table_name = 'payroll_lines' AND action = 'DELETE'`);
    assert.ok(logged.length >= 3, 'every frozen line was audited as it was removed');
  });
  test('after reopening, the month can be changed and closed again', async () => {
    ok(await as(db, 'fin', `INSERT INTO salary_advances(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 5, '${PAST}', '${PAST}-15')`));
    ok(await as(db, 'fin', `SELECT rpc_close_payroll('${PAST}')`));
    assert.equal(Number((await q1(`SELECT advances FROM payroll_lines WHERE month = '${PAST}' AND worker_id = '${WORKER.casualA}'`)).advances), 55);
  });
});

describe('audit log', () => {
  test('an edit is recorded with who made it and the before and after', async () => {
    ok(await as(db, 'hr', `UPDATE workers SET phone_number = '0244000111' WHERE id = '${WORKER.casualA}'`));
    const e = await q1(`SELECT * FROM audit_log WHERE table_name = 'workers' AND row_id = '${WORKER.casualA}' ORDER BY id DESC LIMIT 1`);
    assert.deepEqual([e.action, e.changed_by, e.new_data.phone_number], ['UPDATE', ID.hr, '0244000111']);
    assert.notEqual(e.old_data.phone_number, '0244000111');
  });
  test('an update that changes nothing is not logged', async () => {
    const before = (await q1(`SELECT count(*)::int n FROM audit_log`)).n;
    await as(db, 'hr', `UPDATE workers SET phone_number = '0244000111' WHERE id = '${WORKER.casualA}'`);
    assert.equal((await q1(`SELECT count(*)::int n FROM audit_log`)).n, before);
  });
  test('daily attendance marking is not logged, but a correction is', async () => {
    const n = async () => (await q1(`SELECT count(*)::int n FROM audit_log WHERE table_name = 'attendance'`)).n;
    const before = await n();
    ok(await as(db, 'sup', `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.officeA}', current_date, 'Present', '${ID.sup}', 'non_marking')`));
    assert.equal(await n(), before);
    ok(await as(db, 'hr', `UPDATE attendance SET status = 'Leave' WHERE worker_id = '${WORKER.officeA}' AND date = current_date`));
    assert.equal(await n(), before + 1);
  });
  test('deleting a record logs what it was', async () => {
    await db.exec(`INSERT INTO salary_advances(worker_id, amount, month, date) VALUES ('${WORKER.casualB}', 7, '${CURRENT}', '${CURRENT}-02')`);
    ok(await as(db, 'fin', `DELETE FROM salary_advances WHERE worker_id = '${WORKER.casualB}' AND month = '${CURRENT}'`));
    const e = await q1(`SELECT * FROM audit_log WHERE table_name = 'salary_advances' AND action = 'DELETE' ORDER BY id DESC LIMIT 1`);
    assert.equal(e.old_data.amount, 7);
    assert.equal(e.changed_by, ID.fin);
  });
  test('the CEO, HR and system manager can read it; nobody else', async () => {
    for (const who of ['ceo', 'hr', 'sys']) assert.ok((await as(db, who, `SELECT count(*)::int n FROM audit_log`)).rows[0].n > 0, who);
    for (const who of ['fin', 'sup', 'st1', 'pm', 'logm']) assert.equal((await as(db, who, `SELECT count(*)::int n FROM audit_log`)).rows[0].n, 0, who);
  });
  test('nobody can add, change or erase entries through the API', async () => {
    bad(await as(db, 'ceo', `INSERT INTO audit_log(table_name, action) VALUES ('workers', 'INSERT')`));
    assert.equal((await as(db, 'ceo', `UPDATE audit_log SET changed_by = NULL`)).affectedRows, 0);
    assert.equal((await as(db, 'ceo', `DELETE FROM audit_log`)).affectedRows, 0);
  });
});

describe('two-step sign-in', () => {
  const aal2 = { aal: 'aal2' };
  const readLoans = (who, opts) => as(db, who, `SELECT count(*)::int n FROM loans`, undefined, opts);
  const readWorkers = (who, opts) => as(db, who, `SELECT count(*)::int n FROM workers`, undefined, opts);

  test('it is off by default, so nothing changes until the CEO switches it on', async () => {
    assert.equal((await q1(`SELECT value FROM app_settings WHERE key = 'require_mfa'`)).value, 'false');
    assert.ok((await readLoans('fin')).rows[0].n > 0);
  });
  test('only the CEO can switch it on, and only from a session that has a second factor', async () => {
    bad(await as(db, 'hr', `SELECT rpc_set_setting('require_mfa', 'true')`, undefined, aal2), /Only the CEO/);
    bad(await as(db, 'ceo', `SELECT rpc_set_setting('require_mfa', 'true')`), /second factor|two-step/i);
    bad(await as(db, 'ceo', `SELECT rpc_set_setting('something_else', 'true')`, undefined, aal2), /Unknown/);
    assert.equal((await as(db, 'ceo', `UPDATE app_settings SET value = 'true'`)).affectedRows, 0, 'settings are written only through rpc_set_setting');
    ok(await as(db, 'ceo', `SELECT rpc_set_setting('require_mfa', 'true')`, undefined, aal2));
  });
  test('once on, finance data needs a verified second factor', async () => {
    assert.equal((await readLoans('fin')).rows[0].n, 0, 'aal1 sees nothing');
    assert.ok((await readLoans('fin', aal2)).rows[0].n > 0, 'aal2 sees it');
    bad(await as(db, 'fin', `INSERT INTO loans(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 1, '${CURRENT}', '${CURRENT}-01')`));
    ok(await as(db, 'fin', `INSERT INTO loans(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 1, '${CURRENT}', '${CURRENT}-01')`, undefined, aal2));
  });
  test('worker records, payroll and the audit log are covered too', async () => {
    assert.equal((await readWorkers('hr')).rows[0].n, 0);
    assert.ok((await readWorkers('hr', aal2)).rows[0].n > 0);
    assert.equal((await as(db, 'ceo', `SELECT count(*)::int n FROM audit_log`)).rows[0].n, 0);
    assert.ok((await as(db, 'ceo', `SELECT count(*)::int n FROM audit_log`, undefined, aal2)).rows[0].n > 0);
    bad(await as(db, 'fin', `SELECT rpc_close_payroll('${monthsAgo(2)}')`), /Two-step/);
  });
  test('roles outside that group are unaffected, so the field keeps working', async () => {
    assert.ok((await readWorkers('sup')).rows[0].n > 0);
    assert.ok((await as(db, 'st1', `SELECT count(*)::int n FROM inventory`)).rows[0].n > 0);
    ok(await as(db, 'sup', `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.casualB}', current_date, 'Present', '${ID.sup}', 'casual')`));
  });
  test('profile and settings stay readable at aal1, so a user can be sent to enrol', async () => {
    assert.equal((await as(db, 'fin', `SELECT count(*)::int n FROM users WHERE id = '${ID.fin}'`)).rows[0].n, 1);
    assert.equal((await as(db, 'fin', `SELECT value FROM app_settings WHERE key = 'require_mfa'`)).rows[0].value, 'true');
  });
  test('the CEO can switch it off even without a second factor (a lost authenticator is recoverable)', async () => {
    ok(await as(db, 'ceo', `SELECT rpc_set_setting('require_mfa', 'false')`));
    assert.ok((await readLoans('fin')).rows[0].n > 0);
  });
});

describe('account administration', () => {
  const update = (who, target, role, site = 'NULL', store = 'NULL', active = true, opts) =>
    as(db, who, `SELECT rpc_admin_update_user('${ID[target]}', '${role}', ${site}, ${store}, ${active})`, undefined, opts);

  test('only the CEO and system manager', async () => {
    for (const who of ['hr', 'fin', 'pm', 'sup', 'st1']) bad(await update(who, 'pm', 'project_manager'), /permission/);
  });
  test('a system manager can move a supervisor to another site and change a role', async () => {
    ok(await update('sys', 'sup', 'supervisor', `'${SITE.B}'`));
    assert.equal((await q1(`SELECT site_id FROM users WHERE id = '${ID.sup}'`)).site_id, SITE.B);
    ok(await update('sys', 'sup', 'supervisor', `'${SITE.A}'`));
  });
  test('nobody can change their own account', async () => {
    bad(await update('ceo', 'ceo', 'ceo'), /your own/);
    bad(await update('sys', 'sys', 'ceo'), /your own/);
  });
  test('only the CEO can touch a CEO account or grant that role', async () => {
    bad(await update('sys', 'ceo2', 'hr'), /Only the CEO/);
    bad(await update('sys', 'pm', 'ceo'), /Only the CEO/);
    ok(await update('ceo', 'pm', 'project_manager'));
  });
  test('roles must be real, and a supervisor needs a site and a store manager a store', async () => {
    bad(await update('ceo', 'pm', 'wizard'), /Unknown role/);
    bad(await update('ceo', 'pm', 'supervisor'), /needs a site/);
    bad(await update('ceo', 'pm', 'store_manager'), /needs a store/);
    bad(await update('ceo', 'pm', 'supervisor', `'${'9'.repeat(8)}-9999-9999-9999-999999999999'`), /does not exist/);
  });
  test('a second CEO can be deactivated, and then has no access until restored', async () => {
    ok(await update('ceo', 'ceo2', 'ceo', 'NULL', 'NULL', false));
    bad(await update('ceo2', 'pm', 'project_manager'), /permission/);
    ok(await update('ceo', 'ceo2', 'ceo', 'NULL', 'NULL', true));
    ok(await update('ceo2', 'pm', 'project_manager'));
  });
  test('one CEO can demote another, and a demoted CEO loses the power to', async () => {
    ok(await update('ceo2', 'ceo', 'hr'));
    bad(await update('ceo', 'ceo2', 'hr'), /permission|Only the CEO/);
    await db.exec(`UPDATE users SET role = 'ceo' WHERE id = '${ID.ceo}'`); // restore (the dashboard's job in real life)
    ok(await update('ceo', 'pm', 'project_manager'));
  });
  test('a deactivated account loses all access at once, but can still read its own profile', async () => {
    ok(await update('ceo', 'st1', 'store_manager', 'NULL', `'${STORE.one}'`, false));
    assert.equal((await as(db, 'st1', `SELECT count(*)::int n FROM inventory`)).rows[0].n, 0);
    assert.equal((await as(db, 'st1', `SELECT count(*)::int n FROM workers`)).rows[0].n, 0);
    assert.equal((await as(db, 'st1', `SELECT count(*)::int n FROM sites`)).rows[0].n, 0);
    assert.equal((await as(db, 'st1', `SELECT count(*)::int n FROM users`)).rows[0].n, 1);
    assert.equal((await as(db, 'st1', `SELECT is_active FROM users WHERE id = '${ID.st1}'`)).rows[0].is_active, false);
    bad(await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 1, NULL)`));
    ok(await update('ceo', 'st1', 'store_manager', 'NULL', `'${STORE.one}'`, true));
    assert.ok((await as(db, 'st1', `SELECT count(*)::int n FROM inventory`)).rows[0].n > 0);
  });
  test('role changes are in the audit log', async () => {
    const e = await q1(`SELECT * FROM audit_log WHERE table_name = 'users' AND row_id = '${ID.st1}' ORDER BY id DESC LIMIT 1`);
    assert.equal(e.changed_by, ID.ceo);
  });
  test('a plain UPDATE on users is still impossible', async () => {
    assert.equal((await as(db, 'ceo', `UPDATE users SET role = 'ceo' WHERE id = '${ID.pm}'`)).affectedRows, 0);
  });
});

describe('invoices', () => {
  const insert = (who, store, extra = '') =>
    as(db, who, `INSERT INTO invoices(store_id, item_id, amount, quantity, supplier_name, type${extra ? ', created_by' : ''})
      VALUES ('${store}', '${ITEM.one}', 500, 4, 'ACME', 'purchase'${extra ? `, '${extra}'` : ''})`);
  test('a store manager records an invoice for their own store only', async () => {
    ok(await insert('st1', STORE.one));
    bad(await insert('st1', STORE.two));
  });
  test('the author is always the signed-in user, whatever the client claims', async () => {
    ok(await insert('st1', STORE.one, ID.ceo));
    const rows = await q(`SELECT created_by FROM invoices`);
    assert.ok(rows.every((r) => r.created_by === ID.st1));
  });
  test('amounts and quantities must be positive', async () => {
    bad(await as(db, 'st1', `INSERT INTO invoices(store_id, item_id, amount, quantity, supplier_name, type) VALUES ('${STORE.one}', '${ITEM.one}', 0, 1, 'x', 'purchase')`));
    bad(await as(db, 'st1', `INSERT INTO invoices(store_id, item_id, amount, quantity, supplier_name, type) VALUES ('${STORE.one}', '${ITEM.one}', 5, 0, 'x', 'purchase')`));
  });
  test('who can read them', async () => {
    assert.ok((await as(db, 'fin', `SELECT count(*)::int n FROM invoices`)).rows[0].n >= 2);
    assert.equal((await as(db, 'sup', `SELECT count(*)::int n FROM invoices`)).rows[0].n, 0);
    assert.equal((await as(db, 'st2', `SELECT count(*)::int n FROM invoices`)).rows[0].n, 0, 'another store\'s invoices');
  });
  test('invoice changes are audited', async () => {
    assert.ok((await q(`SELECT 1 FROM audit_log WHERE table_name = 'invoices' AND action = 'INSERT'`)).length >= 2);
  });
});

describe('reorder levels and realtime', () => {
  test('every item has a reorder level, default 10, never negative', async () => {
    assert.equal((await q1(`SELECT min_quantity FROM inventory WHERE id = '${ITEM.one}'`)).min_quantity, 10);
    bad(await as(db, 'st1', `UPDATE inventory SET min_quantity = -1 WHERE id = '${ITEM.one}'`));
  });
  test('a store manager sets the level on their own items, not another store\'s', async () => {
    assert.equal((await as(db, 'st1', `UPDATE inventory SET min_quantity = 25 WHERE id = '${ITEM.one}'`)).affectedRows, 1);
    assert.equal((await as(db, 'st1', `UPDATE inventory SET min_quantity = 25 WHERE id = '${ITEM.two}'`)).affectedRows, 0);
  });
  test('attendance, goods log and inventory are published for live updates', async () => {
    const t = (await q(`SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`)).map((r) => r.tablename).sort();
    assert.deepEqual(t, ['attendance', 'goods_log', 'inventory']);
  });
  test('settings can be read by staff and written by no one directly', async () => {
    assert.ok((await as(db, 'sup', `SELECT count(*)::int n FROM app_settings`)).rows[0].n >= 1);
    bad(await as(db, 'ceo', `INSERT INTO app_settings(key, value) VALUES ('x', 'y')`));
  });
});
