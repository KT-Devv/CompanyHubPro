// The demo's stand-ins for the database's rpc_* functions. Each follows the real
// SQL in migrations/*.sql: same permission rules, same validation, same
// messages, so what you see in demo mode is what the live app will do.
import { computeMonth, lineToRow } from './payroll';
import { DemoError, emitChange } from './context';
import type { Row, Tables } from './seed';

export interface Ctx {
  db: Tables;
  userId: string | null;
  role: string | null;
  storeId: string | null;
  aal: 'aal1' | 'aal2';
}

const uuid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`;
const nowIso = () => new Date().toISOString();

// ---- helpers shared with the query layer
export function mfaOk(ctx: Ctx): boolean {
  const required = ctx.db.app_settings.find((s) => s.key === 'require_mfa')?.value === 'true';
  if (!required) return true;
  if (!ctx.role || !['ceo', 'hr', 'finance', 'system_manager'].includes(ctx.role)) return true;
  return ctx.aal === 'aal2';
}

let auditSeq = 1000;
export function audit(ctx: Ctx, table: string, rowId: string | undefined, action: string, oldData: Row | null, newData: Row | null) {
  ctx.db.audit_log.push({
    id: ++auditSeq, changed_at: nowIso(), changed_by: ctx.userId, table_name: table, row_id: rowId ?? null,
    action, old_data: oldData, new_data: newData,
  });
}

function require(ctx: Ctx, roles: string[], message: string) {
  if (!ctx.role || !roles.includes(ctx.role)) throw new DemoError(message, '42501');
}
function requireMfa(ctx: Ctx) {
  if (!mfaOk(ctx)) throw new DemoError('Two-step sign-in is required for this action', '42501');
}

const STOCK_ROLES = ['ceo', 'system_manager', 'project_manager', 'logistics_manager'];
function requireStore(ctx: Ctx, storeId: string | null | undefined, message = 'new row violates row-level security policy for table "inventory"') {
  if (ctx.role && STOCK_ROLES.includes(ctx.role)) return;
  if (ctx.role === 'store_manager' && storeId && ctx.storeId === storeId) return;
  throw new DemoError(message, '42501');
}

const positiveInt = (n: unknown, what: string) => {
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw new DemoError(`${what} must be a positive whole number`, '22023');
  return n;
};

// ---- stock
function addStock(ctx: Ctx, storeId: string, itemName: string, quantity: number, remarks?: string | null) {
  const name = (itemName ?? '').trim();
  if (!name) throw new DemoError('Item name is required', '22023');
  if (!Number.isInteger(quantity) || quantity < 0) throw new DemoError('Quantity must be zero or more', '22023');
  requireStore(ctx, storeId);
  const existing = ctx.db.inventory.find((i) => i.store_id === storeId && i.item_name === name);
  if (existing) {
    existing.quantity += quantity;
    existing.last_updated = nowIso();
    return { id: existing.id, quantity: existing.quantity, created: false };
  }
  const row = { id: uuid(), store_id: storeId, item_name: name, quantity, remarks: remarks?.trim() || null, min_quantity: 10, low_alerted_at: null, last_updated: nowIso() };
  ctx.db.inventory.push(row);
  return { id: row.id, quantity, created: true };
}

function sendGoods(ctx: Ctx, a: Row) {
  const { p_item_id: itemId, p_from_store_id: from, p_to_store_id: to, p_quantity: qty, p_remarks: remarks } = a;
  if (!from) throw new DemoError('Source store is required', '22023');
  if (!to) throw new DemoError('Destination store is required', '22023');
  if (from === to) throw new DemoError('Source and destination store must be different', '22023');
  positiveInt(qty, 'Quantity');
  const item = ctx.db.inventory.find((i) => i.id === itemId);
  if (!item) throw new DemoError('Item not found', 'P0002');
  if (item.store_id !== from) throw new DemoError('Selected item does not belong to the chosen source store', '22023');
  // Same refusal for "not enough stock" and "not your store", so the message never leaks another store's level.
  const mayWrite = ctx.role && (STOCK_ROLES.includes(ctx.role) || (ctx.role === 'store_manager' && ctx.storeId === from));
  if (!mayWrite || item.quantity < qty) throw new DemoError('Insufficient quantity, or you do not have permission to send from that store', '22023');
  item.quantity -= qty;
  item.last_updated = nowIso();
  ctx.db.goods_log.push({
    id: uuid(), item_id: itemId, store_from: from, store_to: to, quantity: qty, type: 'sent', status: 'pending',
    reference_id: null, remarks: remarks?.trim() || null, date: nowIso(), created_at: nowIso(),
  });
}

function receiveAgainstLog(ctx: Ctx, a: Row) {
  const { p_log_id: logId, p_receiving_store_id: store, p_item_name: itemName, p_quantity: qty, p_remarks: remarks } = a;
  positiveInt(qty, 'Quantity');
  const log = ctx.db.goods_log.find((l) => l.id === logId);
  const mine = ctx.role && (STOCK_ROLES.includes(ctx.role) || (ctx.role === 'store_manager' && log?.store_to === ctx.storeId));
  if (!log || log.status !== 'pending' || !mine) {
    throw new DemoError('This transfer was already received or changed, or is not addressed to your store', 'P0002');
  }
  const status = log.quantity === qty ? 'matched' : 'error';
  log.status = status;
  addStock(ctx, store, itemName, qty);
  ctx.db.goods_log.push({
    id: uuid(), item_id: log.item_id, store_from: log.store_from, store_to: store, quantity: qty, type: 'received', status,
    reference_id: log.id, remarks: remarks?.trim() || null, date: nowIso(), created_at: nowIso(),
  });
  return [{ receive_status: status }];
}

function receiveUnlisted(ctx: Ctx, a: Row) {
  const { p_item_id: itemId, p_item_name: itemName, p_receiving_store_id: store, p_quantity: qty, p_remarks: remarks } = a;
  positiveInt(qty, 'Quantity');
  addStock(ctx, store, itemName, qty);
  ctx.db.goods_log.push({
    id: uuid(), item_id: itemId, store_from: null, store_to: store, quantity: qty, type: 'received', status: 'error',
    reference_id: null, remarks: remarks?.trim() || null, date: nowIso(), created_at: nowIso(),
  });
}

// ---- people
function transferWorker(ctx: Ctx, a: Row) {
  const { p_worker_id: id, p_to_site_id: toSite, p_effective_date: date, p_notes: notes, p_new_account_number: acctNo, p_new_account_location: acctLoc } = a;
  require(ctx, ['ceo', 'hr', 'system_manager'], 'The transfer was not saved: you may not have permission');
  requireMfa(ctx);
  if (!toSite) throw new DemoError('Choose a destination site', '22023');
  const worker = ctx.db.workers.find((w) => w.id === id);
  if (!worker) throw new DemoError('Worker not found', 'P0002');
  if (worker.site_id === toSite) throw new DemoError('The worker is already assigned to that site', '22023');
  const casual = worker.worker_type === 'casual';
  const account = (acctNo ?? '').trim() || null;
  if (casual && (!account || !acctLoc)) throw new DemoError('Casual workers require a new account location and number upon transfer', '22023');
  if (!date) throw new DemoError('null value in column "effective_date" of relation "worker_transfers" violates not-null constraint', '23502');

  const before = { ...worker };
  const from = worker.site_id;
  const oldAccount = worker.account_number;
  worker.site_id = toSite;
  if (casual) { worker.account_number = account; worker.account_location = acctLoc; }
  audit(ctx, 'workers', worker.id, 'UPDATE', { site_id: before.site_id, account_number: before.account_number }, { site_id: worker.site_id, account_number: worker.account_number });
  ctx.db.worker_transfers.push({
    id: uuid(), worker_id: id, from_site_id: from, to_site_id: toSite, effective_date: date, cleared_account: casual,
    old_account_number: oldAccount, new_account_number: casual ? account : null, notes: (notes ?? '').trim() || null,
    created_by: ctx.userId, created_at: nowIso(),
  });
}

// ---- payroll
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const utcMonth = () => new Date().toISOString().slice(0, 7);

function closePayroll(ctx: Ctx, a: Row) {
  const month: string = a.p_month;
  require(ctx, ['ceo', 'hr', 'finance'], 'You do not have permission to close payroll');
  requireMfa(ctx);
  if (!month || !MONTH_RE.test(month)) throw new DemoError('Month must look like 2026-09', '22023');
  if (month >= utcMonth()) throw new DemoError('A month can only be closed after it has ended', '22023');
  if (ctx.db.payroll_periods.some((p) => p.month === month)) throw new DemoError('That month is already closed', '23505');

  const lines = computeMonth(ctx.db, month).map((l) => lineToRow(month, l));
  const cents = (key: string) => Math.round(lines.reduce((t, l) => t + Number(l[key]) * 100, 0)) / 100;
  ctx.db.payroll_periods.push({
    month, closed_at: nowIso(), closed_by: ctx.userId, workers: lines.length,
    gross: cents('gross'), total_deductions: cents('total_deductions'), net: cents('net'),
  });
  ctx.db.payroll_lines.push(...lines);
  audit(ctx, 'payroll_periods', month, 'INSERT', null, { month, workers: lines.length });
}

function reopenPayroll(ctx: Ctx, a: Row) {
  const month: string = a.p_month;
  const reason: string = a.p_reason;
  require(ctx, ['ceo'], 'Only the CEO can reopen a closed month');
  requireMfa(ctx);
  if (!reason || reason.trim().length < 5) throw new DemoError('Give a reason (at least 5 characters) for reopening', '22023');
  ctx.db.payroll_reopens.push({ id: ctx.db.payroll_reopens.length + 1, month, reopened_by: ctx.userId, reopened_at: nowIso(), reason: reason.trim() });
  const period = ctx.db.payroll_periods.find((p) => p.month === month);
  if (!period) throw new DemoError('That month is not closed', 'P0002');
  for (const l of ctx.db.payroll_lines.filter((x) => x.month === month)) audit(ctx, 'payroll_lines', `${month}:${l.worker_id}`, 'DELETE', l, null);
  ctx.db.payroll_lines = ctx.db.payroll_lines.filter((x) => x.month !== month);
  ctx.db.payroll_periods = ctx.db.payroll_periods.filter((p) => p.month !== month);
  audit(ctx, 'payroll_periods', month, 'DELETE', period, null);
}

// ---- accounts and settings
const ROLES = ['ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'logistics_manager', 'store_manager', 'secretary'];

function adminUpdateUser(ctx: Ctx, a: Row) {
  const { p_user_id: id, p_role: role, p_site_id: site, p_store_id: store, p_is_active: active } = a;
  require(ctx, ['ceo', 'system_manager'], 'You do not have permission to manage accounts');
  requireMfa(ctx);
  if (id === ctx.userId) throw new DemoError('You cannot change your own account', '42501');
  const target = ctx.db.users.find((u) => u.id === id);
  if (!target) throw new DemoError('Account not found', 'P0002');
  if (!ROLES.includes(role)) throw new DemoError('Unknown role', '22023');
  if ((target.role === 'ceo' || role === 'ceo') && ctx.role !== 'ceo') throw new DemoError('Only the CEO can change a CEO account or grant that role', '42501');
  if (role === 'store_manager' && !store) throw new DemoError('A store manager needs a store', '22023');
  if (role === 'supervisor' && !site) throw new DemoError('A supervisor needs a site', '22023');
  if (site && !ctx.db.sites.some((s) => s.id === site)) throw new DemoError('That site does not exist', '22023');
  if (store && !ctx.db.stores.some((s) => s.id === store)) throw new DemoError('That store does not exist', '22023');
  const before = { role: target.role, site_id: target.site_id, store_id: target.store_id, is_active: target.is_active };
  Object.assign(target, { role, site_id: site ?? null, store_id: store ?? null, is_active: active ?? target.is_active });
  audit(ctx, 'users', target.id, 'UPDATE', before, { role, site_id: target.site_id, store_id: target.store_id, is_active: target.is_active });
}

function setSetting(ctx: Ctx, a: Row) {
  require(ctx, ['ceo'], 'Only the CEO can change settings');
  if (a.p_key !== 'require_mfa') throw new DemoError('Unknown setting', '22023');
  if (!['true', 'false'].includes(a.p_value)) throw new DemoError('Value must be true or false', '22023');
  if (a.p_value === 'true' && ctx.aal !== 'aal2') throw new DemoError('Set up and verify two-step sign-in on your own account first', '42501');
  const row = ctx.db.app_settings.find((s) => s.key === a.p_key);
  const before = row ? { ...row } : null;
  if (row) Object.assign(row, { value: a.p_value, updated_at: nowIso() });
  else ctx.db.app_settings.push({ key: a.p_key, value: a.p_value, updated_at: nowIso() });
  audit(ctx, 'app_settings', a.p_key, 'UPDATE', before, { key: a.p_key, value: a.p_value });
}

const HANDLERS: Record<string, { run: (ctx: Ctx, a: Row) => unknown; touches: string[] }> = {
  rpc_add_stock: { run: (c, a) => [addStock(c, a.p_store_id, a.p_item_name, a.p_quantity, a.p_remarks)], touches: ['inventory'] },
  rpc_send_goods: { run: sendGoods, touches: ['inventory', 'goods_log'] },
  rpc_receive_against_log: { run: receiveAgainstLog, touches: ['inventory', 'goods_log'] },
  rpc_receive_unlisted: { run: receiveUnlisted, touches: ['inventory', 'goods_log'] },
  rpc_transfer_worker: { run: transferWorker, touches: ['workers'] },
  rpc_close_payroll: { run: closePayroll, touches: ['payroll_periods'] },
  rpc_reopen_payroll: { run: reopenPayroll, touches: ['payroll_periods'] },
  rpc_admin_update_user: { run: adminUpdateUser, touches: ['users'] },
  rpc_set_setting: { run: setSetting, touches: ['app_settings'] },
  payroll_compute: { run: (c, a) => computeMonth(c.db, a.p_month).map((l) => lineToRow(a.p_month, l)), touches: [] },
};

export function runRpc(name: string, args: Row, ctx: Ctx): unknown {
  const handler = HANDLERS[name];
  if (!handler) throw new DemoError(`Could not find the function public.${name} in the schema cache`, 'PGRST202');
  const result = handler.run(ctx, args ?? {});
  for (const t of handler.touches) emitChange(t);
  return result;
}
