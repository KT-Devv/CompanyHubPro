import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { as, freshDb, ID, ITEM, SITE, STORE, WORKER } from './harness.mjs';

// The pentest findings, kept as permanent regression tests: forged shipments,
// self-confirmed shipments, spoofed attribution, rewritable audit trail, the
// duplicate-row race, and operations that must succeed or fail as a whole.

let db;
before(async () => { db = await freshDb(); });
const allowed = (r) => assert.ok(!r.error, r.error?.message);
const rows = async (sql) => (await db.query(sql)).rows;
const q1 = async (sql) => (await rows(sql))[0];

describe('rpc_add_stock', () => {
  test('creates a row, then tops up the same one', async () => {
    const a = await as(db, 'st1', `SELECT * FROM rpc_add_stock('${STORE.one}', 'Sand', 5, NULL)`);
    allowed(a);
    assert.equal(a.rows[0].created, true);
    const b = await as(db, 'st1', `SELECT * FROM rpc_add_stock('${STORE.one}', 'Sand', 3, NULL)`);
    assert.deepEqual([b.rows[0].created, b.rows[0].quantity, b.rows[0].id], [false, 8, a.rows[0].id]);
    assert.equal((await q1(`SELECT count(*)::int n FROM inventory WHERE store_id = '${STORE.one}' AND item_name = 'Sand'`)).n, 1);
  });
  test('rejects a blank name and a negative quantity; anon cannot call it', async () => {
    assert.ok((await as(db, 'st1', `SELECT * FROM rpc_add_stock('${STORE.one}', '  ', 1, NULL)`)).error);
    assert.ok((await as(db, 'st1', `SELECT * FROM rpc_add_stock('${STORE.one}', 'Bricks', -1, NULL)`)).error);
    assert.ok((await as(db, 'anon', `SELECT * FROM rpc_add_stock('${STORE.one}', 'X', 1, NULL)`)).error);
  });
  test('two simultaneous creates of a brand-new item land in one row with both quantities', async () => {
    const [r1, r2] = await Promise.all([
      as(db, 'st1', `SELECT * FROM rpc_add_stock('${STORE.one}', 'Gravel', 10, NULL)`),
      as(db, 'st1', `SELECT * FROM rpc_add_stock('${STORE.one}', 'Gravel', 7, NULL)`),
    ]);
    allowed(r1); allowed(r2);
    assert.deepEqual((await rows(`SELECT quantity FROM inventory WHERE store_id = '${STORE.one}' AND item_name = 'Gravel'`)).map((r) => r.quantity), [17]);
  });
  test('the unique constraint exists', async () => {
    assert.equal((await rows(`SELECT 1 FROM pg_constraint WHERE conname = 'inventory_store_item_unique'`)).length, 1);
  });
});

describe('rpc_send_goods', () => {
  test('moves stock out and logs a pending shipment', async () => {
    allowed(await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 10, 'note')`));
    assert.equal((await q1(`SELECT quantity FROM inventory WHERE id = '${ITEM.one}'`)).quantity, 40);
    const log = await q1(`SELECT * FROM goods_log WHERE item_id = '${ITEM.one}' AND type = 'sent' ORDER BY created_at DESC LIMIT 1`);
    assert.deepEqual([log.status, log.store_from, log.store_to, log.quantity], ['pending', STORE.one, STORE.two, 10]);
  });
  test('refuses to oversell, and a refused send changes nothing', async () => {
    assert.ok((await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 999, NULL)`)).error);
    assert.equal((await q1(`SELECT quantity FROM inventory WHERE id = '${ITEM.one}'`)).quantity, 40);
    assert.equal((await q1(`SELECT count(*)::int n FROM goods_log WHERE item_id = '${ITEM.one}' AND type = 'sent'`)).n, 1);
  });
  test('rejects sending to the same store', async () => {
    assert.ok((await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.one}', 1, NULL)`)).error);
  });
  test('a store manager cannot send from a store that is not theirs', async () => {
    const r = await as(db, 'st2', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 1, NULL)`);
    assert.ok(r.error, 'should be refused');
  });
});

describe('forged shipments (goods_log)', () => {
  test('a store cannot insert a "sent" row naming another store as the sender', async () => {
    const r = await as(db, 'st2', `INSERT INTO goods_log(item_id, store_from, store_to, quantity, type, status) VALUES ('${ITEM.two}', '${STORE.one}', '${STORE.two}', 5, 'sent', 'pending')`);
    assert.ok(r.error);
  });
  test('a store can log its own outgoing and incoming rows, but not for another store', async () => {
    allowed(await as(db, 'st1', `INSERT INTO goods_log(item_id, store_from, store_to, quantity, type, status) VALUES ('${ITEM.one}', '${STORE.one}', '${STORE.two}', 5, 'sent', 'pending')`));
    allowed(await as(db, 'st2', `INSERT INTO goods_log(item_id, store_to, quantity, type, status) VALUES ('${ITEM.two}', '${STORE.two}', 5, 'received', 'error')`));
    assert.ok((await as(db, 'st1', `INSERT INTO goods_log(item_id, store_to, quantity, type, status) VALUES ('${ITEM.one}', '${STORE.two}', 5, 'received', 'error')`)).error);
  });
});

describe('rpc_receive_against_log', () => {
  const pendingOf = async (qty) => (await q1(`SELECT id FROM goods_log WHERE store_from = '${STORE.one}' AND store_to = '${STORE.two}' AND type = 'sent' AND status = 'pending' AND quantity = ${qty} ORDER BY created_at DESC LIMIT 1`)).id;
  const destQty = async () => (await q1(`SELECT quantity FROM inventory WHERE store_id = '${STORE.two}' AND item_name = 'Cement'`)).quantity;

  test('the sender cannot confirm its own shipment', async () => {
    await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 6, NULL)`);
    const id = await pendingOf(6);
    assert.ok((await as(db, 'st1', `SELECT * FROM rpc_receive_against_log('${id}', '${STORE.one}', 'Cement', 6, NULL)`)).error);
    assert.equal((await q1(`SELECT status FROM goods_log WHERE id = '${id}'`)).status, 'pending');
  });
  test('the destination receives an exact count: matched, stock credited once, never twice', async () => {
    const id = await pendingOf(6);
    const before = await destQty();
    const r = await as(db, 'st2', `SELECT * FROM rpc_receive_against_log('${id}', '${STORE.two}', 'Cement', 6, NULL)`);
    allowed(r);
    assert.equal(r.rows[0].receive_status, 'matched');
    assert.equal(await destQty(), before + 6);
    assert.ok((await as(db, 'st2', `SELECT * FROM rpc_receive_against_log('${id}', '${STORE.two}', 'Cement', 6, NULL)`)).error);
    assert.equal(await destQty(), before + 6);
  });
  test('a short count is flagged "error" but the counted stock is still credited', async () => {
    await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 4, NULL)`);
    const id = await pendingOf(4);
    const before = await destQty();
    const r = await as(db, 'st2', `SELECT * FROM rpc_receive_against_log('${id}', '${STORE.two}', 'Cement', 3, NULL)`);
    assert.equal(r.rows[0].receive_status, 'error');
    assert.equal(await destQty(), before + 3);
  });
  test('two simultaneous receivers: exactly one wins', async () => {
    await as(db, 'st1', `SELECT rpc_send_goods('${ITEM.one}', '${STORE.one}', '${STORE.two}', 2, NULL)`);
    const id = await pendingOf(2);
    const results = await Promise.all([
      as(db, 'st2', `SELECT * FROM rpc_receive_against_log('${id}', '${STORE.two}', 'Cement', 2, NULL)`),
      as(db, 'st2', `SELECT * FROM rpc_receive_against_log('${id}', '${STORE.two}', 'Cement', 2, NULL)`),
    ]);
    assert.equal(results.filter((r) => !r.error).length, 1);
  });
});

describe('rpc_receive_unlisted', () => {
  test('adds the stock and always flags it for review', async () => {
    allowed(await as(db, 'st2', `SELECT rpc_receive_unlisted('${ITEM.one}', 'Mystery', '${STORE.two}', 9, 'no idea')`));
    assert.equal((await q1(`SELECT quantity FROM inventory WHERE store_id = '${STORE.two}' AND item_name = 'Mystery'`)).quantity, 9);
    assert.equal((await q1(`SELECT status FROM goods_log WHERE store_to = '${STORE.two}' AND store_from IS NULL ORDER BY created_at DESC LIMIT 1`)).status, 'error');
  });
});

describe('rpc_transfer_worker', () => {
  test('moves the worker, resets a casual worker\'s account, and logs who did it', async () => {
    allowed(await as(db, 'hr', `SELECT rpc_transfer_worker('${WORKER.casualA}', '${SITE.B}', current_date, 'moving', 'ACCT-1', '${SITE.B}')`));
    const w = await q1(`SELECT site_id, account_number FROM workers WHERE id = '${WORKER.casualA}'`);
    assert.deepEqual([w.site_id, w.account_number], [SITE.B, 'ACCT-1']);
    const log = await q1(`SELECT * FROM worker_transfers WHERE worker_id = '${WORKER.casualA}' ORDER BY created_at DESC LIMIT 1`);
    assert.equal(log.created_by, ID.hr, 'attributed to the caller, not to anything the client sent');
    assert.deepEqual([log.from_site_id, log.to_site_id], [SITE.A, SITE.B]);
  });
  test('a casual worker needs new account details', async () => {
    assert.ok((await as(db, 'hr', `SELECT rpc_transfer_worker('${WORKER.casualB}', '${SITE.A}', current_date, NULL, NULL, NULL)`)).error);
    assert.equal((await q1(`SELECT site_id FROM workers WHERE id = '${WORKER.casualB}'`)).site_id, SITE.B);
  });
  test('all or nothing: a failure on the second write rolls back the first', async () => {
    const before = await q1(`SELECT site_id FROM workers WHERE id = '${WORKER.officeA}'`);
    // effective_date is NOT NULL on the log row, so this fails AFTER the worker was already updated.
    assert.ok((await as(db, 'hr', `SELECT rpc_transfer_worker('${WORKER.officeA}', '${SITE.B}', NULL, NULL, NULL, NULL)`)).error);
    assert.equal((await q1(`SELECT site_id FROM workers WHERE id = '${WORKER.officeA}'`)).site_id, before.site_id);
    assert.equal((await q1(`SELECT count(*)::int n FROM worker_transfers WHERE worker_id = '${WORKER.officeA}'`)).n, 0);
  });
  test('a project manager cannot transfer', async () => {
    assert.ok((await as(db, 'pm', `SELECT rpc_transfer_worker('${WORKER.casualB}', '${SITE.A}', current_date, NULL, 'X', '${SITE.A}')`)).error);
  });
});

describe('the transfer log is an audit trail', () => {
  test('nobody, not even the CEO, can alter or delete a transfer', async () => {
    const { id } = await q1(`SELECT id FROM worker_transfers LIMIT 1`);
    assert.equal((await as(db, 'ceo', `UPDATE worker_transfers SET notes = 'tampered' WHERE id = '${id}'`)).affectedRows, 0);
    assert.equal((await as(db, 'ceo', `DELETE FROM worker_transfers WHERE id = '${id}'`)).affectedRows, 0);
    assert.notEqual((await q1(`SELECT notes FROM worker_transfers WHERE id = '${id}'`)).notes, 'tampered');
  });
  test('created_by must be the caller even on a direct insert', async () => {
    const insert = (by) => as(db, 'hr', `INSERT INTO worker_transfers(worker_id, from_site_id, to_site_id, effective_date, created_by) VALUES ('${WORKER.casualB}', '${SITE.A}', '${SITE.B}', current_date, '${by}')`);
    assert.ok((await insert(ID.ceo)).error, 'framing someone else');
    allowed(await insert(ID.hr));
  });
});
