// Applies the database migrations, in order, to any Postgres/Supabase database.
// This is how a staging (or fresh production) database is built, instead of
// pasting five files into the SQL editor by hand.
//
//   node --env-file=.env.staging scripts/migrate.mjs                 show the plan, change nothing
//   node --env-file=.env.staging scripts/migrate.mjs --confirm <host>  run it
//
// The host you confirm has to match the database in DATABASE_URL. That is on
// purpose: pointing this at production by mistake needs you to type the
// production host out, not just add a flag.
//
// Every file in the chain is safe to re-run, and each runs in its own
// transaction: a failure rolls that file back and stops, never half-applies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(root, 'migrations');

// Keep in step with tests/sql/harness.mjs and migrations/README.md.
// update_rls_for_all_roles.sql must stay last: it recreates every policy.
export const CHAIN = [
  'supabase-setup.sql',
  'fix_all_database_issues.sql',
  'harden_transactions_and_integrity_migration.sql',
  'add_platform_features_migration.sql',
  'update_rls_for_all_roles.sql',
];

function parseArgs(argv) {
  const args = { confirm: null, from: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirm') args.confirm = argv[++i];
    else if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--only') args.only = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return args;
}

const HELP = `Usage: node --env-file=<env file> scripts/migrate.mjs [--confirm <host>] [--from <file>] [--only <file>]

  (no flags)         print the database and the files that would run; change nothing
  --confirm <host>   actually run; <host> must equal the database host shown in the plan
  --from <file>      start at this file of the chain (for re-running a later part)
  --only <file>      run just this file

Environment:
  DATABASE_URL       postgres://user:password@host:5432/postgres (Supabase: Project settings > Database)
  DATABASE_CA        optional path to the database's CA certificate, to verify TLS fully
                     (without it the connection is encrypted but the server is not verified)
`;

export function planFiles({ from, only }) {
  if (only) {
    if (!CHAIN.includes(only)) throw new Error(`${only} is not part of the chain.`);
    return [only];
  }
  if (from) {
    const i = CHAIN.indexOf(from);
    if (i < 0) throw new Error(`${from} is not part of the chain.`);
    return CHAIN.slice(i);
  }
  return CHAIN;
}

function connectionOptions(url) {
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const config = { connectionString: url.toString() };
  if (!local) {
    config.ssl = process.env.DATABASE_CA
      ? { ca: fs.readFileSync(process.env.DATABASE_CA, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }
  return config;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(HELP);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Put it in an env file (see .env.staging.example) and pass --env-file.');
    process.exit(2);
  }
  const url = new URL(process.env.DATABASE_URL);
  const files = planFiles(args);
  for (const f of files) if (!fs.existsSync(path.join(MIGRATIONS, f))) throw new Error(`Missing migration file: ${f}`);

  console.log(`Database : ${url.hostname}:${url.port || 5432}/${url.pathname.slice(1) || 'postgres'}  (user ${decodeURIComponent(url.username)})`);
  console.log('Will run :');
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  if (args.confirm !== url.hostname) {
    console.log(args.confirm ? `\nNot run: --confirm "${args.confirm}" does not match the database host "${url.hostname}".` : `\nNothing changed. To run this, repeat with:  --confirm ${url.hostname}`);
    process.exit(args.confirm ? 1 : 0);
  }

  const client = new pg.Client(connectionOptions(url));
  await client.connect();
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
      const started = Date.now();
      process.stdout.write(`Running ${f} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`done (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.log('FAILED');
        console.error(`\n${f} was rolled back. ${error.message}${error.position ? ` (at character ${error.position})` : ''}`);
        console.error('Earlier files in this run were applied. Fix the problem and re-run; every file is safe to repeat.');
        process.exit(1);
      }
    }
    console.log('\nAll migrations applied.');
  } finally {
    await client.end();
  }
}

// Only run when called directly, so the planning logic can be imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
