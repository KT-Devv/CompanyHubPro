import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { as, daysAgo, freshDb, ID, ITEM, SITE, STORE, today, WORKER } from './harness.mjs';

// What each role may and may not do, enforced by the database itself. The
// browser talks to Supabase with a public key, so these policies are the real
// access control; the app's role checks only decide what to show.

let db;
before(async () => { db = await freshDb(); });

const allowed = (r) => assert.ok(!r.error, r.error?.message);
const refused = (r) => assert.ok(r.error || (r.affectedRows ?? 0) === 0, 'expected the database to refuse this');
const hasFkOn = async (col, ref) => (await db.query(`
  SELECT count(*)::int n FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.contype = 'f' AND c.conrelid = 'public.workers'::regclass AND c.confrelid = 'public.${ref}'::regclass AND a.attname = '${col}'`)).rows[0].n;

describe('schema', () => {
  test('workers has exactly one foreign key per reference column', async () => {
    assert.equal(await hasFkOn('portfolio_id', 'portfolios'), 1);
    assert.equal(await hasFkOn('position_id', 'positions'), 1);
    assert.equal(await hasFkOn('site_id', 'sites'), 1);
    assert.equal(await hasFkOn('account_location', 'sites'), 1);
  });
});

describe('users and reference data', () => {
  test('nobody can promote themselves (no policy lets a user update their own row)', async () => {
    const r = await as(db, 'sup', `UPDATE users SET role = 'ceo' WHERE id = '${ID.sup}'`);
    assert.equal(r.affectedRows, 0);
    assert.equal((await db.query(`SELECT role FROM users WHERE id = '${ID.sup}'`)).rows[0].role, 'supervisor');
  });
  test('nobody can reassign their own site', async () => {
    assert.equal((await as(db, 'sup', `UPDATE users SET site_id = '${SITE.B}' WHERE id = '${ID.sup}'`)).affectedRows, 0);
  });
  test('staff can read the staff directory', async () => {
    const r = await as(db, 'sup', `SELECT count(*)::int n FROM users`);
    assert.ok(r.rows[0].n >= 10);
  });
  test('a login with no profile sees no directory and no reference data', async () => {
    assert.equal((await as(db, 'ghost', `SELECT count(*)::int n FROM users`)).rows[0].n, 0);
    assert.equal((await as(db, 'ghost', `SELECT count(*)::int n FROM sites`)).rows[0].n, 0);
    assert.equal((await as(db, 'ghost', `SELECT count(*)::int n FROM stores`)).rows[0].n, 0);
  });
  test('the anonymous key sees nothing', async () => {
    for (const t of ['workers', 'users', 'sites', 'inventory', 'attendance']) {
      assert.equal((await as(db, 'anon', `SELECT count(*)::int n FROM ${t}`)).rows[0]?.n ?? 0, 0, t);
    }
  });
});

describe('workers', () => {
  test('a secretary sees only office (non-marking) staff', async () => {
    const r = await as(db, 'sec', `SELECT worker_type::text t FROM workers`);
    assert.deepEqual(r.rows.map((x) => x.t), ['non_marking']);
  });
  test('a supervisor can read every worker (the other-site search needs it) but not edit them', async () => {
    assert.equal((await as(db, 'sup', `SELECT count(*)::int n FROM workers`)).rows[0].n, 3);
    assert.equal((await as(db, 'sup', `UPDATE workers SET name = 'x' WHERE id = '${WORKER.casualA}'`)).affectedRows, 0);
  });
  test('HR can edit workers; a project manager cannot', async () => {
    assert.equal((await as(db, 'hr', `UPDATE workers SET phone_number = '024' WHERE id = '${WORKER.casualA}'`)).affectedRows, 1);
    assert.equal((await as(db, 'pm', `UPDATE workers SET site_id = '${SITE.B}' WHERE id = '${WORKER.casualA}'`)).affectedRows, 0);
  });
});

describe('attendance', () => {
  const mark = (who, worker, status, by, type, date = today(), extra = '') =>
    as(db, who, `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${worker}', '${date}', '${status}', '${ID[by]}', '${type}')${extra}`);

  test('a supervisor marks attendance as themselves, once per worker per day', async () => {
    allowed(await mark('sup', WORKER.casualA, 'Present', 'sup', 'casual'));
    const dup = await mark('sup', WORKER.casualA, 'Absent', 'sup', 'casual');
    assert.equal(dup.error?.code, '23505');
  });
  test('a supervisor cannot record attendance in someone else\'s name', async () => {
    assert.ok((await mark('sup', WORKER.casualB, 'Present', 'hr', 'casual')).error);
  });
  test('a batch mark that skips already-marked workers is allowed and inserts nothing', async () => {
    const r = await as(db, 'sup', `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type)
      VALUES ('${WORKER.casualA}', '${today()}', 'Absent', '${ID.sup}', 'casual') ON CONFLICT (worker_id, date) DO NOTHING RETURNING worker_id`);
    allowed(r);
    assert.equal(r.rows.length, 0);
  });
  test('a secretary can mark office staff but not casual workers; a project manager cannot mark at all', async () => {
    assert.ok((await mark('sec', WORKER.casualB, 'Present', 'sec', 'casual')).error);
    allowed(await mark('sec', WORKER.officeA, 'Present', 'sec', 'non_marking'));
    assert.ok((await mark('pm', WORKER.casualB, 'Present', 'pm', 'casual')).error);
  });
  test('a supervisor can only turn Present into Half Day, and cannot undo, rewrite or delete', async () => {
    const upd = (to, from = 'casualA') => as(db, 'sup', `UPDATE attendance SET status = '${to}' WHERE worker_id = '${WORKER[from]}' AND date = '${today()}'`);
    assert.equal((await upd('Half Day')).affectedRows, 1);
    assert.equal((await upd('Present')).affectedRows, 0, 'cannot move a Half Day back');
    await db.exec(`INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.casualB}', '${today()}', 'Absent', '${ID.sup}', 'casual')`);
    assert.equal((await upd('Half Day', 'casualB')).affectedRows, 0, 'cannot turn Absent into Half Day');
    assert.equal((await as(db, 'sup', `DELETE FROM attendance WHERE worker_id = '${WORKER.casualA}'`)).affectedRows, 0);
  });
  test('HR can correct and delete; finance can read', async () => {
    assert.equal((await as(db, 'hr', `UPDATE attendance SET status = 'Leave' WHERE worker_id = '${WORKER.casualB}'`)).affectedRows, 1);
    assert.ok((await as(db, 'fin', `SELECT count(*)::int n FROM attendance`)).rows[0].n >= 2);
    assert.equal((await as(db, 'hr', `DELETE FROM attendance WHERE worker_id = '${WORKER.casualB}'`)).affectedRows, 1);
  });

  describe('who can mark which day', () => {
    const offlineMark = (who, worker, date, tappedAt, type = 'casual') => as(db, who, `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type, offline_marked_at)
      VALUES ('${worker}', '${date}', 'Present', '${ID[who]}', '${type}', '${tappedAt}')`);
    const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
    // Midday on a given day, so the moment is unambiguously on that UTC date.
    const noonOf = (d) => `${d}T12:00:00Z`;

    test('a supervisor can mark TODAY only', async () => {
      allowed(await mark('sup', WORKER.casualB, 'Present', 'sup', 'casual', today()));
    });
    test('a supervisor cannot mark yesterday, a few days back, or a future day', async () => {
      assert.ok((await mark('sup', WORKER.casualA, 'Present', 'sup', 'casual', daysAgo(1))).error, 'yesterday');
      assert.ok((await mark('sup', WORKER.casualA, 'Present', 'sup', 'casual', daysAgo(2))).error, '2 days back');
      assert.ok((await mark('sup', WORKER.casualA, 'Present', 'sup', 'casual', daysAgo(10))).error, '10 days back');
      assert.ok((await mark('sup', WORKER.casualA, 'Present', 'sup', 'casual', daysAgo(-1))).error, 'tomorrow');
      assert.ok((await mark('sup', WORKER.casualA, 'Present', 'sup', 'casual', daysAgo(-3))).error, 'future');
    });
    test('a mark made offline on the day and sent later is accepted, because it was marked that day', async () => {
      allowed(await offlineMark('sup', WORKER.casualA, daysAgo(1), noonOf(daysAgo(1))));
    });
    test('an offline stamp cannot be used to mark a different day than the one it was made on', async () => {
      // tapped today, claims yesterday
      assert.ok((await offlineMark('sup', WORKER.casualB, daysAgo(1), hoursAgo(1))).error);
      // tapped a day ago, claims two days ago
      assert.ok((await offlineMark('sup', WORKER.casualB, daysAgo(2), noonOf(daysAgo(1)))).error);
    });
    test('offline marks are still bounded: not too old, not from the future', async () => {
      assert.ok((await offlineMark('sup', WORKER.casualB, daysAgo(20), noonOf(daysAgo(20)))).error, 'too old');
      assert.ok((await offlineMark('sup', WORKER.casualB, daysAgo(-1), new Date(Date.now() + 86_400_000).toISOString())).error, 'future stamp');
    });
    test('a supervisor can no longer turn a past day Present record into a half day', async () => {
      await db.exec(`INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ('${WORKER.casualB}', '${daysAgo(1)}', 'Present', '${ID.sup}', 'casual')`);
      const r = await as(db, 'sup', `UPDATE attendance SET status = 'Half Day' WHERE worker_id = '${WORKER.casualB}' AND date = '${daysAgo(1)}'`);
      assert.equal(r.affectedRows, 0);
    });
    test('store managers and secretaries are also limited to today', async () => {
      assert.ok((await mark('sec', WORKER.officeA, 'Present', 'sec', 'non_marking', daysAgo(1))).error, 'secretary, yesterday');
      assert.ok((await mark('sec', WORKER.officeA, 'Present', 'sec', 'non_marking', daysAgo(2))).error, 'secretary, 2 days back');
      assert.ok((await mark('st1', WORKER.officeA, 'Present', 'st1', 'non_marking', daysAgo(1))).error, 'store manager, yesterday');
      // ...but a store manager's offline mark made on that day is still fine
      allowed(await offlineMark('st1', WORKER.officeA, daysAgo(1), noonOf(daysAgo(1)), 'non_marking'));
    });
    test('only HR and the system manager can back-fill an earlier day', async () => {
      allowed(await mark('hr', WORKER.officeA, 'Present', 'hr', 'non_marking', daysAgo(10)));
      allowed(await mark('sys', WORKER.casualA, 'Present', 'sys', 'casual', daysAgo(5)));
      for (const who of ['sup', 'sec', 'st1']) {
        assert.ok((await mark(who, WORKER.casualB, 'Present', who, 'casual', daysAgo(5))).error, `${who} cannot back-fill`);
      }
    });
    test('the system manager can also mark today', async () => {
      // Everyone is already marked today by earlier tests; ON CONFLICT DO NOTHING still has to pass the policy check.
      const r = await as(db, 'sys', `INSERT INTO attendance(worker_id, date, status, marked_by, worker_type)
        VALUES ('${WORKER.casualB}', '${today()}', 'Present', '${ID.sys}', 'casual') ON CONFLICT (worker_id, date) DO NOTHING`);
      allowed(r);
    });
    test('the CEO is read-only for attendance: cannot add, change or delete', async () => {
      assert.ok((await mark('ceo', WORKER.casualA, 'Present', 'ceo', 'casual', today())).error, 'insert today');
      assert.ok((await mark('ceo', WORKER.casualA, 'Present', 'ceo', 'casual', daysAgo(5))).error, 'insert earlier day');
      assert.ok((await as(db, 'ceo', `SELECT count(*)::int n FROM attendance`)).rows[0].n > 0, 'but can read');
      assert.equal((await as(db, 'ceo', `UPDATE attendance SET status = 'Leave'`)).affectedRows, 0, 'cannot change');
      assert.equal((await as(db, 'ceo', `DELETE FROM attendance`)).affectedRows, 0, 'cannot delete');
    });
  });
});

describe('finance', () => {
  const ledger = (who, table) => as(db, who, `INSERT INTO ${table}(worker_id, amount, month, date) VALUES ('${WORKER.casualA}', 100, '2026-01', '2026-01-05')`);
  test('finance adds advances, loans and deductions', async () => {
    for (const t of ['salary_advances', 'loans', 'deductions']) allowed(await ledger('fin', t));
  });
  test('a system manager can add deductions but not advances', async () => {
    allowed(await ledger('sys', 'deductions'));
    assert.ok((await ledger('sys', 'salary_advances')).error);
  });
  test('a project manager can neither add nor read finance data', async () => {
    assert.ok((await ledger('pm', 'deductions')).error);
    assert.equal((await as(db, 'pm', `SELECT count(*)::int n FROM salary_advances`)).rows[0].n, 0);
  });
  test('a supervisor cannot read deductions; a system manager can read advances', async () => {
    assert.equal((await as(db, 'sup', `SELECT count(*)::int n FROM deductions`)).rows[0].n, 0);
    assert.ok((await as(db, 'sys', `SELECT count(*)::int n FROM salary_advances`)).rows[0].n >= 1);
  });
});

describe('worker transfers', () => {
  const insert = (who, by) => as(db, who, `INSERT INTO worker_transfers(worker_id, from_site_id, to_site_id, effective_date, cleared_account, old_account_number, new_account_number, created_by)
    VALUES ('${WORKER.casualA}', '${SITE.A}', '${SITE.B}', '${today()}', true, '1', '2', '${ID[by]}')`);
  test('HR can log a transfer as themselves; a project manager cannot', async () => {
    allowed(await insert('hr', 'hr'));
    assert.ok((await insert('pm', 'pm')).error);
  });
  test('a project manager can read transfers', async () => {
    assert.ok((await as(db, 'pm', `SELECT count(*)::int n FROM worker_transfers`)).rows[0].n >= 1);
  });
});

describe('logistics', () => {
  test('a store manager updates their own store only, and cannot add to or delete from others', async () => {
    assert.equal((await as(db, 'st1', `UPDATE inventory SET quantity = 40 WHERE id = '${ITEM.one}'`)).affectedRows, 1);
    assert.equal((await as(db, 'st1', `UPDATE inventory SET quantity = 0 WHERE id = '${ITEM.two}'`)).affectedRows, 0);
    assert.ok((await as(db, 'st1', `INSERT INTO inventory(store_id, item_name, quantity) VALUES ('${STORE.two}', 'Sand', 5)`)).error);
    allowed(await as(db, 'st1', `INSERT INTO inventory(store_id, item_name, quantity) VALUES ('${STORE.one}', 'Sand', 5)`));
    assert.equal((await as(db, 'st1', `DELETE FROM inventory WHERE id = '${ITEM.one}'`)).affectedRows, 0);
  });
  test('store managers can still read every store\'s inventory (a transfer\'s item lives at the sender)', async () => {
    assert.ok((await as(db, 'st1', `SELECT count(*)::int n FROM inventory`)).rows[0].n >= 3);
  });
  test('a logistics manager can update any store', async () => {
    assert.equal((await as(db, 'logm', `UPDATE inventory SET quantity = 51 WHERE id = '${ITEM.two}'`)).affectedRows, 1);
  });
  test('the goods log follows the same rules (sender logs, receiver claims once, each sees only their own)', async () => {
    const ins = await as(db, 'st1', `INSERT INTO goods_log(item_id, store_from, store_to, quantity, type, status)
      VALUES ('${ITEM.one}', '${STORE.one}', '${STORE.two}', 5, 'sent', 'pending') RETURNING id`);
    allowed(ins);
    const id = ins.rows[0].id;
    assert.ok((await as(db, 'st1', `INSERT INTO goods_log(item_id, store_from, store_to, quantity, type, status)
      VALUES ('${ITEM.two}', '${STORE.two}', '${STORE.three}', 5, 'sent', 'pending')`)).error, 'cannot log between two other stores');
    const claim = () => as(db, 'st2', `UPDATE goods_log SET status = 'matched' WHERE id = '${id}' AND status = 'pending' RETURNING id`);
    assert.equal((await claim()).rows.length, 1);
    assert.equal((await claim()).rows.length, 0, 'second claim finds nothing pending');
    allowed(await as(db, 'st2', `INSERT INTO goods_log(item_id, store_from, store_to, quantity, type, status, reference_id)
      VALUES ('${ITEM.one}', '${STORE.one}', '${STORE.two}', 5, 'received', 'matched', '${id}')`));
    await db.exec(`INSERT INTO goods_log(item_id, store_from, store_to, quantity, type, status) VALUES ('${ITEM.one}', '${STORE.three}', '${STORE.three}', 1, 'sent', 'pending')`);
    const mine = (await as(db, 'st1', `SELECT store_from, store_to FROM goods_log`)).rows;
    assert.ok(mine.length >= 1 && mine.every((l) => l.store_from === STORE.one || l.store_to === STORE.one));
  });
});

describe('migrations are repeatable', () => {
  test('policies can be recreated on a populated database', async () => {
    const { migrate, CHAIN } = await import('./harness.mjs');
    await migrate(db, CHAIN.slice(1));
  });
});
