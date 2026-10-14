import test from 'node:test';
import assert from 'node:assert/strict';
import { aalFromJwt, safeEqual, twoStepSatisfied, validateBanToggle, validateInvite } from './accounts.ts';
import { buildAlert, escapeHtml, isLow, needsAlert, needsReset, type StockItem } from './stock.ts';

const SITE = '3f2b1c9e-8a4d-4e5f-9b6a-1c2d3e4f5a6b';
const STORE = '4a3c2d1e-9b5e-4f60-8c7b-2d3e4f5a6b7c';
const base = { email: ' New.Person@Example.com ', full_name: '  Ama Mensah ', role: 'hr' };

test('invite: normalises the email and name and drops site/store the role does not use', () => {
  const r = validateInvite({ ...base, site_id: SITE, store_id: STORE }, 'system_manager');
  assert.ok(r.ok);
  assert.deepEqual(r.value, { email: 'new.person@example.com', fullName: 'Ama Mensah', role: 'hr', siteId: null, storeId: null });
});

test('invite: supervisors need a site, store managers need a store', () => {
  assert.equal(validateInvite({ ...base, role: 'supervisor' }, 'ceo').ok, false);
  assert.equal(validateInvite({ ...base, role: 'store_manager', site_id: SITE }, 'ceo').ok, false);
  const sup = validateInvite({ ...base, role: 'supervisor', site_id: SITE, store_id: STORE }, 'ceo');
  assert.ok(sup.ok && sup.value.siteId === SITE && sup.value.storeId === null);
  const sm = validateInvite({ ...base, role: 'store_manager', store_id: STORE }, 'ceo');
  assert.ok(sm.ok && sm.value.storeId === STORE && sm.value.siteId === null);
});

test('invite: only the CEO can create a CEO', () => {
  assert.equal(validateInvite({ ...base, role: 'ceo' }, 'system_manager').ok, false);
  assert.equal(validateInvite({ ...base, role: 'ceo' }, 'ceo').ok, true);
});

test('invite: rejects bad emails, names, roles and ids', () => {
  for (const email of ['', 'nobody', 'a@b', 'a b@c.com', 'x'.repeat(250) + '@e.com']) assert.equal(validateInvite({ ...base, email }, 'ceo').ok, false, email);
  assert.equal(validateInvite({ ...base, full_name: 'A' }, 'ceo').ok, false);
  assert.equal(validateInvite({ ...base, role: 'janitor' }, 'ceo').ok, false);
  assert.equal(validateInvite({ ...base, role: 'supervisor', site_id: "1'; drop table users;--" }, 'ceo').ok, false);
  assert.equal(validateInvite({ ...base, role: 'supervisor', site_id: 42 }, 'ceo').ok, false);
});

test('ban toggle needs a real user id and an explicit boolean', () => {
  assert.equal(validateBanToggle({ user_id: SITE, banned: true }).ok, true);
  assert.equal(validateBanToggle({ user_id: 'nope', banned: true }).ok, false);
  assert.equal(validateBanToggle({ user_id: SITE, banned: 'yes' }).ok, false);
});

test('two-step rule mirrors the database', () => {
  assert.equal(twoStepSatisfied({ requireMfa: false, callerRole: 'ceo', aal: 'aal1' }), true);
  assert.equal(twoStepSatisfied({ requireMfa: true, callerRole: 'ceo', aal: 'aal1' }), false);
  assert.equal(twoStepSatisfied({ requireMfa: true, callerRole: 'ceo', aal: 'aal2' }), true);
  assert.equal(twoStepSatisfied({ requireMfa: true, callerRole: 'supervisor', aal: 'aal1' }), true);
  assert.equal(twoStepSatisfied({ requireMfa: true, callerRole: 'system_manager', aal: undefined }), false);
});

test('safeEqual and aalFromJwt', () => {
  assert.equal(safeEqual('secret', 'secret'), true);
  assert.equal(safeEqual('secret', 'secreT'), false);
  assert.equal(safeEqual('secret', 'secret2'), false);
  assert.equal(safeEqual('', ''), true);
  const payload = Buffer.from(JSON.stringify({ aal: 'aal2' })).toString('base64url');
  assert.equal(aalFromJwt(`h.${payload}.s`), 'aal2');
  assert.equal(aalFromJwt('garbage'), undefined);
});

const item = (over: Partial<StockItem>): StockItem => ({ id: 'i', item_name: 'Cement', quantity: 5, min_quantity: 10, low_alerted_at: null, store_name: 'Accra', ...over });

test('stock: low means at or below a level above zero; level 0 switches it off', () => {
  assert.equal(isLow(item({ quantity: 10, min_quantity: 10 })), true);
  assert.equal(isLow(item({ quantity: 11, min_quantity: 10 })), false);
  assert.equal(isLow(item({ quantity: 0, min_quantity: 0 })), false);
});

test('stock: alert once per dip, reset after restock', () => {
  const items = [
    item({ id: 'a' }),
    item({ id: 'b', low_alerted_at: '2026-10-01T00:00:00Z' }), // still low, already told
    item({ id: 'c', quantity: 50, low_alerted_at: '2026-10-01T00:00:00Z' }), // restocked
    item({ id: 'd', quantity: 50 }),
  ];
  assert.deepEqual(needsAlert(items).map((i) => i.id), ['a']);
  assert.deepEqual(needsReset(items).map((i) => i.id), ['c']);
});

test('stock: message is escaped, sorted and singular/plural correct', () => {
  assert.equal(buildAlert([]), null);
  const one = buildAlert([item({ item_name: '<script>x</script>' })])!;
  assert.match(one.subject, /1 item to reorder/);
  assert.ok(!one.html.includes('<script>'));
  assert.ok(one.html.includes('&lt;script&gt;'));
  const two = buildAlert([item({ id: '1', item_name: 'Sand', store_name: 'Tema' }), item({ id: '2', item_name: 'Cement', store_name: 'Accra' })])!;
  assert.match(two.subject, /2 items/);
  assert.ok(two.text.indexOf('Cement') < two.text.indexOf('Sand'));
  assert.equal(escapeHtml(`a&b"c'd`), 'a&amp;b&quot;c&#39;d');
});
