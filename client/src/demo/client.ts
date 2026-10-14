// An in-memory stand-in for the slice of supabase-js the app uses, so the whole
// UI can run without a database (VITE_DEMO=true). It is not a full PostgREST
// emulator: it supports exactly the calls the hooks in lib/api make.
import { DEMO_USER_IDS, seedTables, type Row, type Tables } from './seed';
import {
  currentAal, currentUserId, DEMO_TOTP_CODE, DemoError, emitChange, getMfa, onChange, setAal, setMfa, setSession,
} from './context';
import { audit, mfaOk, runRpc, type Ctx } from './rpc';

const LATENCY_MS = 90;

interface DbError { message: string; code?: string }
interface Result { data: any; error: DbError | null }

// ------------------------------------------------------------------ relations
// Which column of the parent row an embedded table hangs off.
const EMBED_COLUMN: Record<string, Record<string, string>> = {
  workers: { portfolios: 'portfolio_id', positions: 'position_id', sites: 'site_id' },
  inventory: { stores: 'store_id' },
  goods_log: { inventory: 'item_id', stores: 'store_from' },
  invoices: { inventory: 'item_id', stores: 'store_id' },
};
const CONSTRAINT_COLUMN: Record<string, string> = {
  goods_log_store_from_fkey: 'store_from',
  goods_log_store_to_fkey: 'store_to',
};
const UNIQUE: Record<string, string[]> = { attendance: ['worker_id', 'date'], inventory: ['store_id', 'item_name'] };

// What the database's triggers and policies do, in miniature.
const AUDITED = new Set(['workers', 'users', 'salary_advances', 'loans', 'deductions', 'salary_schedules', 'portfolios', 'positions', 'sites', 'stores', 'invoices', 'app_settings']);
const MONTH_LOCKED = new Set(['attendance', 'salary_advances', 'loans', 'deductions']);
// Written only by triggers / rpc_* functions: no direct writes for anyone.
const NO_DIRECT_WRITES = new Set(['audit_log', 'payroll_periods', 'payroll_lines', 'payroll_reopens', 'app_settings', 'users']);
const MFA_TABLES = new Set(['workers', 'worker_transfers', 'salary_advances', 'loans', 'deductions', 'salary_schedules', 'payroll_periods', 'payroll_lines', 'payroll_reopens', 'audit_log']);
const READ_ROLES: Record<string, string[]> = {
  audit_log: ['ceo', 'system_manager', 'hr'],
  payroll_periods: ['ceo', 'hr', 'finance', 'system_manager'],
  payroll_lines: ['ceo', 'hr', 'finance', 'system_manager'],
  payroll_reopens: ['ceo', 'hr', 'finance', 'system_manager'],
  salary_advances: ['ceo', 'hr', 'finance', 'system_manager'],
  loans: ['ceo', 'hr', 'finance', 'system_manager'],
  deductions: ['ceo', 'hr', 'finance', 'system_manager'],
};

function makeCtx(db: Tables): Ctx {
  const id = currentUserId();
  const user = db.users.find((u) => u.id === id);
  const active = !!user && user.is_active !== false;
  return { db, userId: id, role: active ? user!.role : null, storeId: active ? user!.store_id ?? null : null, aal: currentAal() };
}

// ------------------------------------------------------------------ select() parsing
interface ColNode { kind: 'all' }
interface ColumnNode { kind: 'col'; name: string }
interface EmbedNode { kind: 'embed'; alias: string; table: string; hint: string | null; cols: SelectNode[] }
type SelectNode = ColNode | ColumnNode | EmbedNode;

function splitTop(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(cols: string): SelectNode[] {
  return splitTop(cols).map((part): SelectNode => {
    if (part === '*') return { kind: 'all' };
    const open = part.indexOf('(');
    if (open === -1) return { kind: 'col', name: part };
    const head = part.slice(0, open);
    const inner = part.slice(open + 1, part.lastIndexOf(')'));
    const [aliasPart, rest] = head.includes(':') ? head.split(':') : [null, head];
    const [table, hint] = rest.split('!');
    return { kind: 'embed', alias: aliasPart ?? table, table, hint: hint ?? null, cols: parseSelect(inner) };
  });
}

// ------------------------------------------------------------------ helpers
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`);
const nowIso = () => new Date().toISOString();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function compare(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

type Predicate = (row: Row) => boolean;

function parseOr(expr: string): Predicate {
  const clauses = splitTop(expr).map((clause) => {
    const [col, op, ...rest] = clause.split('.');
    const value = rest.join('.');
    return (row: Row) => {
      const v = row[col];
      if (op === 'eq') return String(v) === value;
      if (op === 'neq') return String(v) !== value;
      if (op === 'is') return value === 'null' ? v == null : v != null;
      return false;
    };
  });
  return (row) => clauses.some((c) => c(row));
}

// ------------------------------------------------------------------ query builder
class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private filters: Predicate[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private cols = '*';
  private returning = false;
  private payload: any = null;
  private options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private limitN: number | null = null;
  private from = 0;
  private to: number | null = null;
  private mode: 'many' | 'one' | 'maybe' = 'many';

  constructor(private db: Tables, private table: string) {}

  private ctx(): Ctx { return makeCtx(this.db); }
  private denied(message = `new row violates row-level security policy for table "${this.table}"`): Result {
    return { data: null, error: { message, code: '42501' } };
  }
  // The month a record belongs to, for the closed-month lock.
  private monthOf(row: Row | undefined): string | undefined {
    if (!row) return undefined;
    return this.table === 'attendance' ? String(row.date ?? '').slice(0, 7) : row.month;
  }
  private assertOpen(...rows: (Row | undefined)[]) {
    if (!MONTH_LOCKED.has(this.table)) return;
    for (const r of rows) {
      const m = this.monthOf(r);
      if (m && this.db.payroll_periods.some((p) => p.month === m)) {
        throw new DemoError('Payroll for that month is closed. Reopen it first to change this record.');
      }
    }
  }
  private log(action: string, oldRow: Row | null, newRow: Row | null) {
    if (this.table === 'attendance' ? action === 'INSERT' : !AUDITED.has(this.table)) return;
    if (action === 'UPDATE' && JSON.stringify(oldRow) === JSON.stringify(newRow)) return;
    audit(this.ctx(), this.table, (newRow ?? oldRow)?.id, action, oldRow && { ...oldRow }, newRow && { ...newRow });
  }

  select(cols = '*') { this.returning = true; this.cols = cols; return this; }
  insert(payload: any) { this.op = 'insert'; this.payload = payload; return this; }
  update(payload: any) { this.op = 'update'; this.payload = payload; return this; }
  upsert(payload: any, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = 'upsert'; this.payload = payload; this.options = options; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(col: string, value: any) { this.filters.push((r) => r[col] === value); return this; }
  neq(col: string, value: any) { this.filters.push((r) => r[col] !== value); return this; }
  in(col: string, values: any[]) { this.filters.push((r) => values.includes(r[col])); return this; }
  gte(col: string, value: any) { this.filters.push((r) => compare(r[col], value) >= 0); return this; }
  lte(col: string, value: any) { this.filters.push((r) => compare(r[col], value) <= 0); return this; }
  ilike(col: string, pattern: string) { const re = likeToRegExp(pattern); this.filters.push((r) => r[col] != null && re.test(String(r[col]))); return this; }
  is(col: string, value: null) { this.filters.push((r) => (value === null ? r[col] == null : r[col] === value)); return this; }
  or(expr: string) { this.filters.push(parseOr(expr)); return this; }

  order(col: string, opts: { ascending?: boolean } = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.from = from; this.to = to; return this; }
  single() { this.mode = 'one'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<T1 = Result, T2 = never>(onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.execute()), LATENCY_MS)).then(onfulfilled, onrejected);
  }

  // ---- execution
  private rows(): Row[] { return (this.db[this.table] ??= []); }
  private matching(): Row[] { return this.rows().filter((r) => this.filters.every((f) => f(r))); }

  private project(row: Row, nodes: SelectNode[]): Row {
    const out: Row = {};
    for (const node of nodes) {
      if (node.kind === 'all') Object.assign(out, row);
      else if (node.kind === 'col') out[node.name] = row[node.name];
      else out[node.alias] = this.embed(row, node);
    }
    return out;
  }

  private embed(parent: Row, node: EmbedNode): Row | null {
    const column = (node.hint && (CONSTRAINT_COLUMN[node.hint] ?? node.hint)) || EMBED_COLUMN[this.table]?.[node.table];
    const key = column ? parent[column] : undefined;
    const target = (this.db[node.table] ?? []).find((r) => r.id === key);
    return target ? this.projectPlain(target, node.cols) : null;
  }

  private projectPlain(row: Row, nodes: SelectNode[]): Row {
    const out: Row = {};
    for (const n of nodes) {
      if (n.kind === 'all') Object.assign(out, row);
      else if (n.kind === 'col') out[n.name] = row[n.name];
    }
    return out;
  }

  private shape(rows: Row[]): Result {
    const nodes = parseSelect(this.cols);
    const projected = rows.map((r) => this.project(r, nodes));
    if (this.mode === 'many') return { data: clone(projected), error: null };
    if (this.mode === 'maybe') {
      if (projected.length > 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      return { data: clone(projected[0] ?? null), error: null };
    }
    if (projected.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    return { data: clone(projected[0]), error: null };
  }

  private defaults(row: Row): Row {
    const t = this.table;
    const base: Row = { id: uuid() };
    if (t === 'invoices') { base.date = nowIso(); base.created_by = currentUserId(); }
    if (t !== 'inventory') base.created_at = nowIso();
    if (t === 'attendance') base.timestamp = nowIso();
    if (t === 'inventory') { base.last_updated = nowIso(); base.quantity = 0; base.min_quantity = 10; base.low_alerted_at = null; }
    if (t === 'goods_log') { base.date = nowIso(); base.status = 'pending'; }
    return { ...base, ...row };
  }

  private violatesUnique(row: Row, ignoreId?: string): boolean {
    const cols = UNIQUE[this.table];
    if (!cols) return false;
    return this.rows().some((r) => r.id !== ignoreId && cols.every((c) => r[c] === row[c]));
  }

  private execute(): Result {
    const result = this.run();
    // Anything that wrote and succeeded is what Realtime would announce.
    if (this.op !== 'select' && !result.error) emitChange(this.table);
    return result;
  }

  private run(): Result {
    try {
      const ctx = this.ctx();
      if (this.op === 'select') {
        const readers = READ_ROLES[this.table];
        const blocked =
          (!ctx.role && this.table !== 'users') ||
          (readers && !readers.includes(ctx.role ?? '')) ||
          (MFA_TABLES.has(this.table) && !mfaOk(ctx));
        let rows = blocked ? [] : this.matching();
        // A deactivated login can read only its own profile row.
        if (!ctx.role && this.table === 'users') rows = rows.filter((r) => r.id === ctx.userId);
        for (const { col, asc } of [...this.orders].reverse()) rows = [...rows].sort((a, b) => compare(a[col], b[col]) * (asc ? 1 : -1));
        if (this.to !== null) rows = rows.slice(this.from, this.to + 1);
        if (this.limitN !== null) rows = rows.slice(0, this.limitN);
        return this.shape(rows);
      }

      // ---- writes
      if (!ctx.role) return this.denied();
      if (MFA_TABLES.has(this.table) && !mfaOk(ctx)) return this.denied();
      if (NO_DIRECT_WRITES.has(this.table)) {
        // Inserts raise; updates and deletes silently match nothing, exactly like a table with no write policy.
        if (this.op === 'insert' || this.op === 'upsert') return this.denied();
        return this.returning ? this.shape([]) : { data: null, error: null };
      }
      if (this.table === 'worker_transfers' && (this.op === 'update' || this.op === 'delete')) {
        return this.returning ? this.shape([]) : { data: null, error: null };
      }
      if (this.table === 'attendance' && (this.op === 'insert' || this.op === 'upsert')) {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
        for (const item of list) {
          const date = String(item.date);
          // Who may mark at all (the secretary only office staff), as in the database.
          const mayMark = ['hr', 'system_manager', 'supervisor', 'store_manager'].includes(ctx.role) || (ctx.role === 'secretary' && item.worker_type === 'non_marking');
          if (!mayMark) return this.denied();
          // Mirrors the database: HR and the system manager any earlier day; every other marking role the day
          // itself (or an offline mark whose tap time falls on that same day).
          const tapDay = item.offline_marked_at ? String(item.offline_marked_at).slice(0, 10) : null;
          const dayOk = ['hr', 'system_manager'].includes(ctx.role) || date === day(0) || (tapDay === date && date >= day(-3));
          if (item.marked_by !== ctx.userId || date > day(1) || !dayOk) return this.denied();
        }
      }

      if (this.op === 'insert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        const created: Row[] = [];
        for (const item of list) {
          const row = this.defaults(item);
          this.assertOpen(row);
          if (this.violatesUnique(row)) return { data: null, error: { message: `duplicate key value violates unique constraint "${this.table}_${UNIQUE[this.table].join('_')}_key"`, code: '23505' } };
          this.rows().push(row);
          this.log('INSERT', null, row);
          created.push(row);
        }
        return this.returning ? this.shape(created) : { data: null, error: null };
      }

      if (this.op === 'upsert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        const conflictCols = (this.options.onConflict ?? 'id').split(',').map((c) => c.trim());
        const touched: Row[] = [];
        for (const item of list) {
          const existing = this.rows().find((r) => conflictCols.every((c) => r[c] === item[c]));
          if (existing) {
            if (this.options.ignoreDuplicates) continue;
            Object.assign(existing, item);
            touched.push(existing);
          } else {
            const row = this.defaults(item);
            this.assertOpen(row);
            this.rows().push(row);
            touched.push(row);
          }
        }
        return this.returning ? this.shape(touched) : { data: null, error: null };
      }

      if (this.op === 'update') {
        const rows = this.matching();
        for (const r of rows) {
          const before = { ...r };
          const next = { ...r, ...this.payload };
          this.assertOpen(before, next);
          if (this.table === 'inventory' && next.min_quantity < 0) return { data: null, error: { message: 'new row for relation "inventory" violates check constraint', code: '23514' } };
          Object.assign(r, this.payload);
          if (this.table === 'inventory') r.last_updated = nowIso();
          this.log('UPDATE', before, r);
        }
        return this.returning ? this.shape(rows) : { data: null, error: null };
      }

      // delete
      const rows = this.matching();
      if (this.table === 'workers') {
        const inUse = rows.find((w) => this.db.attendance.some((a) => a.worker_id === w.id));
        if (inUse) return { data: null, error: { message: 'update or delete on table "workers" violates foreign key constraint', code: '23503' } };
      }
      for (const r of rows) this.assertOpen(r);
      this.db[this.table] = this.rows().filter((r) => !rows.includes(r));
      for (const r of rows) this.log('DELETE', r, null);
      return this.returning ? this.shape(rows) : { data: null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Demo backend error', code: e instanceof DemoError ? e.code : undefined } };
    }
  }
}

// ------------------------------------------------------------------ rpc
// supabase.rpc(...) is awaited like a query and may be followed by .single().
class RpcQuery implements PromiseLike<Result> {
  private one = false;
  constructor(private db: Tables, private name: string, private args: Row) {}
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then<T1 = Result, T2 = never>(onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.execute()), LATENCY_MS)).then(onfulfilled, onrejected);
  }
  private execute(): Result {
    try {
      const out = runRpc(this.name, this.args, makeCtx(this.db));
      if (this.one && Array.isArray(out)) {
        if (out.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
        return { data: clone(out[0]), error: null };
      }
      return { data: out === undefined ? null : clone(out), error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Demo backend error', code: e instanceof DemoError ? e.code : undefined } };
    }
  }
}

// ------------------------------------------------------------------ realtime
function createChannel() {
  const handlers: { table: string; cb: (payload: any) => void }[] = [];
  let off: (() => void) | undefined;
  const channel = {
    on(_type: string, filter: { table?: string }, cb: (payload: any) => void) {
      handlers.push({ table: filter?.table ?? '*', cb });
      return channel;
    },
    subscribe(status?: (s: string) => void) {
      off = onChange((table) => handlers.filter((h) => h.table === '*' || h.table === table).forEach((h) => h.cb({ eventType: '*', table })));
      status?.('SUBSCRIBED');
      return channel;
    },
    unsubscribe() { off?.(); off = undefined; return Promise.resolve('ok'); },
  };
  return channel;
}

// ------------------------------------------------------------------ edge functions
function invokeFunction(db: Tables, name: string, options: { body?: Row } = {}): Result {
  const ctx = makeCtx(db);
  const body = options.body ?? {};
  if (name !== 'admin-users') return { data: null, error: { message: `Function ${name} is not available in demo mode` } };
  if (!ctx.role || !['ceo', 'system_manager'].includes(ctx.role)) return { data: null, error: { message: 'You do not have permission to manage accounts', code: '42501' } };
  if (body.action === 'invite') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { data: null, error: { message: 'Enter a valid email address.' } };
    if (db.users.some((u) => u.email === email)) return { data: null, error: { message: 'An account with that email already exists.' } };
    if (body.role === 'ceo' && ctx.role !== 'ceo') return { data: null, error: { message: 'Only the CEO can create another CEO.', code: '42501' } };
    const user = { id: `demo-${uuid().slice(0, 8)}`, email, full_name: String(body.full_name ?? '').trim() || email, role: body.role, site_id: body.site_id ?? null, store_id: body.store_id ?? null, is_active: true, created_at: nowIso() };
    db.users.push(user);
    audit(ctx, 'users', user.id, 'INSERT', null, { ...user });
    emitChange('users');
    return { data: { id: user.id, email }, error: null };
  }
  if (body.action === 'sync_ban') return { data: { ok: true }, error: null };
  return { data: null, error: { message: 'Unknown action' } };
}

// ------------------------------------------------------------------ auth
function createAuth(db: Tables) {
  type Listener = (event: string, session: any) => void;
  const listeners = new Set<Listener>();

  const sessionFor = (userId: string | null) => {
    if (!userId) return null;
    const profile = db.users.find((u) => u.id === userId);
    return profile ? { user: { id: profile.id, email: profile.email }, access_token: 'demo' } : null;
  };
  const emit = (event: string, session: any) => listeners.forEach((l) => l(event, session));
  const me = () => currentUserId();

  const mfa = {
    async listFactors() {
      const state = me() ? getMfa(me()!) : null;
      const factors = state ? [{ id: state.factorId, factor_type: 'totp', status: state.verified ? 'verified' : 'unverified', friendly_name: 'Authenticator app' }] : [];
      return { data: { all: factors, totp: factors.filter((f) => f.status === 'verified') }, error: null };
    },
    async enroll() {
      const id = `factor-${uuid().slice(0, 8)}`;
      setMfa(me()!, { factorId: id, verified: false });
      const secret = 'DEMOSECRETKEY234';
      // A recognisable placeholder instead of a scannable code; in demo mode the code is always 123456.
      const qr = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="white" stroke="#ccd"/><text x="80" y="76" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#222a72">Demo QR</text><text x="80" y="96" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#666">code: ' + DEMO_TOTP_CODE + '</text></svg>');
      return { data: { id, type: 'totp', totp: { qr_code: qr, secret, uri: `otpauth://totp/SiteTrack:demo?secret=${secret}` } }, error: null };
    },
    async challenge({ factorId }: { factorId: string }) { return { data: { id: `challenge-${factorId}` }, error: null }; },
    async verify({ factorId, code }: { factorId: string; challengeId?: string; code: string }) {
      if (code !== DEMO_TOTP_CODE) return { data: null, error: { message: 'Invalid TOTP code entered' } };
      setMfa(me()!, { factorId, verified: true });
      setAal('aal2');
      emit('MFA_CHALLENGE_VERIFIED', sessionFor(me()));
      return { data: { access_token: 'demo' }, error: null };
    },
    async challengeAndVerify(p: { factorId: string; code: string }) { return mfa.verify(p); },
    async unenroll({ factorId }: { factorId: string }) {
      const state = getMfa(me()!);
      if (state?.factorId === factorId) setMfa(me()!, null);
      setAal('aal1');
      return { data: { id: factorId }, error: null };
    },
    async getAuthenticatorAssuranceLevel() {
      const state = me() ? getMfa(me()!) : null;
      const current = currentAal();
      return { data: { currentLevel: current, nextLevel: state?.verified ? 'aal2' : current }, error: null };
    },
  };

  return {
    async getSession() {
      return { data: { session: sessionFor(me()) }, error: null };
    },
    async getUser() {
      const s = sessionFor(me());
      return { data: { user: s?.user ?? null }, error: null };
    },
    onAuthStateChange(cb: Listener) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      const profile = db.users.find((u) => u.email === email.trim().toLowerCase());
      if (!profile) return { data: null, error: { message: 'Demo mode: sign in with one of the role buttons (for example ceo@demo.local).' } };
      setSession(profile.id);
      setAal('aal1');
      emit('SIGNED_IN', sessionFor(profile.id));
      return { data: { session: sessionFor(profile.id) }, error: null };
    },
    async signOut() {
      setSession(null);
      setAal(null);
      emit('SIGNED_OUT', null);
      return { error: null };
    },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser() { return { data: {}, error: null }; },
    mfa,
  };
}

export function createDemoClient() {
  const db = seedTables();
  const client = {
    from: (table: string) => new Query(db, table),
    rpc: (name: string, args: Row = {}) => new RpcQuery(db, name, args),
    auth: createAuth(db),
    channel: (_name: string) => createChannel(),
    removeChannel: (channel: { unsubscribe: () => unknown }) => Promise.resolve(channel.unsubscribe()),
    functions: { invoke: async (name: string, options?: { body?: Row }) => invokeFunction(db, name, options) },
    // Handy in the console: window.__demoDb, and window.__demoEmit('attendance') to simulate another device.
    __db: db,
    __emit: emitChange,
  };
  return client;
}

export { DEMO_USER_IDS };
