// A real Postgres (PGlite, in-process WASM) with a stand-in for Supabase's
// `auth` schema, so the migrations and row-level-security policies can be
// exercised exactly as the app uses them: as a given signed-in user, through
// the same policies and functions, with no network and no Supabase project.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS = path.resolve(here, '../../migrations');

// The order the README tells people to run them in.
export const CHAIN = [
  'supabase-setup.sql',
  'fix_all_database_issues.sql',
  'harden_transactions_and_integrity_migration.sql',
  'add_platform_features_migration.sql',
  'update_rls_for_all_roles.sql',
];

export const ID = {
  ceo: '00000000-0000-0000-0000-00000000c001',
  hr: '00000000-0000-0000-0000-00000000c002',
  fin: '00000000-0000-0000-0000-00000000c003',
  sys: '00000000-0000-0000-0000-00000000c004',
  pm: '00000000-0000-0000-0000-00000000c005',
  sup: '00000000-0000-0000-0000-00000000c006',
  sec: '00000000-0000-0000-0000-00000000c007',
  st1: '00000000-0000-0000-0000-00000000c008',
  st2: '00000000-0000-0000-0000-00000000c009',
  logm: '00000000-0000-0000-0000-00000000c00a',
  ceo2: '00000000-0000-0000-0000-00000000c00b',
  ghost: '00000000-0000-0000-0000-00000000c0ff', // signed in, but no profile row
};
const ROLE = {
  ceo: 'ceo', hr: 'hr', fin: 'finance', sys: 'system_manager', pm: 'project_manager',
  sup: 'supervisor', sec: 'secretary', st1: 'store_manager', st2: 'store_manager',
  logm: 'logistics_manager', ceo2: 'ceo',
};
export const SITE = { A: '10000000-0000-0000-0000-00000000000a', B: '10000000-0000-0000-0000-00000000000b' };
export const STORE = { one: '20000000-0000-0000-0000-000000000001', two: '20000000-0000-0000-0000-000000000002', three: '20000000-0000-0000-0000-000000000003' };
export const WORKER = {
  casualA: '30000000-0000-0000-0000-00000000000a',
  officeA: '30000000-0000-0000-0000-00000000000b',
  casualB: '30000000-0000-0000-0000-00000000000c',
};
export const ITEM = { one: '40000000-0000-0000-0000-000000000001', two: '40000000-0000-0000-0000-000000000002' };

export const iso = (d) => d.toISOString().slice(0, 10);
export const today = () => iso(new Date());
export const daysAgo = (n) => iso(new Date(Date.now() - n * 86_400_000));
// YYYY-MM for `n` months before the current one (UTC, like the database).
export function monthsAgo(n) {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  return m.toISOString().slice(0, 7);
}

const read = (f) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8').replace(/CREATE EXTENSION[^;]*;/g, '');

export async function bootstrap() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
      AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE PUBLICATION supabase_realtime;
  `);
  return db;
}

export async function migrate(db, files = CHAIN) {
  for (const f of files) await db.exec(read(f));
}

// Supabase grants the API roles broad table privileges and relies on RLS.
export async function grantLikeSupabase(db) {
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
  `);
}

export async function seed(db) {
  await db.exec(`
    INSERT INTO sites(id, site_name) VALUES ('${SITE.A}', 'A'), ('${SITE.B}', 'B');
    INSERT INTO stores(id, name, location) VALUES
      ('${STORE.one}', 'One', 'x'), ('${STORE.two}', 'Two', 'x'), ('${STORE.three}', 'Three', 'x');
  `);
  for (const [k, id] of Object.entries(ID)) {
    await db.exec(`INSERT INTO auth.users(id) VALUES ('${id}')`);
    if (k === 'ghost') continue;
    const site = k === 'sup' ? `'${SITE.A}'` : 'NULL';
    const store = k === 'st1' ? `'${STORE.one}'` : k === 'st2' ? `'${STORE.two}'` : 'NULL';
    await db.exec(
      `INSERT INTO users(id, email, full_name, role, site_id, store_id)
       VALUES ('${id}', '${k}@x.com', '${k}', '${ROLE[k]}', ${site}, ${store})`,
    );
  }
  await db.exec(`
    INSERT INTO portfolios(id, portfolio_name, rate) VALUES ('50000000-0000-0000-0000-000000000001', 'Mason', 100);
    INSERT INTO positions(id, position_name, rate) VALUES ('60000000-0000-0000-0000-000000000001', 'Accountant', 3000);
    INSERT INTO workers(id, name, worker_type, site_id, portfolio_id, position_id) VALUES
      ('${WORKER.casualA}', 'Casual A', 'casual', '${SITE.A}', '50000000-0000-0000-0000-000000000001', NULL),
      ('${WORKER.officeA}', 'Office A', 'non_marking', '${SITE.A}', NULL, '60000000-0000-0000-0000-000000000001'),
      ('${WORKER.casualB}', 'Casual B', 'casual', '${SITE.B}', '50000000-0000-0000-0000-000000000001', NULL);
    INSERT INTO inventory(id, store_id, item_name, quantity) VALUES
      ('${ITEM.one}', '${STORE.one}', 'Cement', 50), ('${ITEM.two}', '${STORE.two}', 'Cement', 50);
  `);
}

// One fully migrated, seeded database.
export async function freshDb() {
  const db = await bootstrap();
  await migrate(db);
  await grantLikeSupabase(db);
  await seed(db);
  return db;
}

// Run `sql` as a signed-in user (who = a key of ID) or as `anon`. Errors are
// returned, not thrown, so a test can assert that something was refused.
// `aal` is the session's assurance level: aal2 means a second factor was used.
export async function as(db, who, sql, params, { aal = 'aal1' } = {}) {
  await db.exec(`SET ROLE ${who === 'anon' ? 'anon' : 'authenticated'};`);
  if (who !== 'anon') {
    const claims = JSON.stringify({ sub: ID[who], aal, role: 'authenticated' });
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [ID[who], claims]);
  }
  try {
    return await db.query(sql, params);
  } catch (e) {
    return { error: e, rows: [], affectedRows: 0 };
  } finally {
    await db.exec('RESET ROLE');
  }
}
