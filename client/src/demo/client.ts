// An in-memory stand-in for the slice of supabase-js the app uses, so the whole
// UI can run without a database (VITE_DEMO=true). It is not a full PostgREST
// emulator: it supports exactly the calls the hooks in lib/api make.
import { DEMO_USER_IDS, seedTables, type Row, type Tables } from './seed';

const LATENCY_MS = 90;
const SESSION_KEY = 'sitetrack-demo-user';

interface DbError { message: string; code?: string }
interface Result { data: any; error: DbError | null }

// ------------------------------------------------------------------ relations
// Which column of the parent row an embedded table hangs off.
const EMBED_COLUMN: Record<string, Record<string, string>> = {
  workers: { portfolios: 'portfolio_id', positions: 'position_id', sites: 'site_id' },
  inventory: { stores: 'store_id' },
  goods_log: { inventory: 'item_id', stores: 'store_from' },
};
const CONSTRAINT_COLUMN: Record<string, string> = {
  goods_log_store_from_fkey: 'store_from',
  goods_log_store_to_fkey: 'store_to',
};
const UNIQUE: Record<string, string[]> = { attendance: ['worker_id', 'date'] };

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
    if (t !== 'inventory') base.created_at = nowIso();
    if (t === 'attendance') base.timestamp = nowIso();
    if (t === 'inventory') { base.last_updated = nowIso(); base.quantity = 0; }
    if (t === 'goods_log') { base.date = nowIso(); base.status = 'pending'; }
    return { ...base, ...row };
  }

  private violatesUnique(row: Row, ignoreId?: string): boolean {
    const cols = UNIQUE[this.table];
    if (!cols) return false;
    return this.rows().some((r) => r.id !== ignoreId && cols.every((c) => r[c] === row[c]));
  }

  private execute(): Result {
    try {
      if (this.op === 'select') {
        let rows = this.matching();
        for (const { col, asc } of [...this.orders].reverse()) rows = [...rows].sort((a, b) => compare(a[col], b[col]) * (asc ? 1 : -1));
        if (this.to !== null) rows = rows.slice(this.from, this.to + 1);
        if (this.limitN !== null) rows = rows.slice(0, this.limitN);
        return this.shape(rows);
      }

      if (this.op === 'insert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        const created: Row[] = [];
        for (const item of list) {
          const row = this.defaults(item);
          if (this.violatesUnique(row)) return { data: null, error: { message: `duplicate key value violates unique constraint "${this.table}_${UNIQUE[this.table].join('_')}_key"`, code: '23505' } };
          this.rows().push(row);
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
            this.rows().push(row);
            touched.push(row);
          }
        }
        return this.returning ? this.shape(touched) : { data: null, error: null };
      }

      if (this.op === 'update') {
        const rows = this.matching();
        for (const r of rows) {
          Object.assign(r, this.payload);
          if (this.table === 'inventory') r.last_updated = nowIso();
        }
        return this.returning ? this.shape(rows) : { data: null, error: null };
      }

      // delete
      const rows = this.matching();
      if (this.table === 'workers') {
        const inUse = rows.find((w) => this.db.attendance.some((a) => a.worker_id === w.id));
        if (inUse) return { data: null, error: { message: 'update or delete on table "workers" violates foreign key constraint', code: '23503' } };
      }
      this.db[this.table] = this.rows().filter((r) => !rows.includes(r));
      return this.returning ? this.shape(rows) : { data: null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Demo backend error' } };
    }
  }
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
  const stored = () => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  };
  const store = (value: string | null) => {
    try { value ? localStorage.setItem(SESSION_KEY, value) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  };
  const emit = (event: string, session: any) => listeners.forEach((l) => l(event, session));

  return {
    async getSession() {
      return { data: { session: sessionFor(stored()) }, error: null };
    },
    onAuthStateChange(cb: Listener) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      const profile = db.users.find((u) => u.email === email.trim().toLowerCase());
      if (!profile) return { data: null, error: { message: 'Demo mode: sign in with one of the role buttons (for example ceo@demo.local).' } };
      store(profile.id);
      emit('SIGNED_IN', sessionFor(profile.id));
      return { data: { session: sessionFor(profile.id) }, error: null };
    },
    async signOut() {
      store(null);
      emit('SIGNED_OUT', null);
      return { error: null };
    },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser() { return { data: {}, error: null }; },
  };
}

export function createDemoClient() {
  const db = seedTables();
  return {
    from: (table: string) => new Query(db, table),
    auth: createAuth(db),
    // Handy in the console: window.__demoDb
    __db: db,
  };
}

export { DEMO_USER_IDS };
