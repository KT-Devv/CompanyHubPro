// Guards the glue that is easy to let drift: the migration order used by the
// real runner, the SQL test harness and the docs must be one and the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAIN as RUNNER_CHAIN, planFiles } from '../scripts/migrate.mjs';
import { CHAIN as HARNESS_CHAIN, MIGRATIONS } from './sql/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the migration runner and the SQL tests use the same chain, in the same order', () => {
  assert.deepEqual(RUNNER_CHAIN, HARNESS_CHAIN);
});

test('the policy file always runs last, and every file in the chain exists', () => {
  assert.equal(RUNNER_CHAIN.at(-1), 'update_rls_for_all_roles.sql');
  for (const f of RUNNER_CHAIN) assert.ok(fs.existsSync(path.join(MIGRATIONS, f)), `${f} is missing`);
});

test('the migrations README lists every file of the chain in order', () => {
  const readme = fs.readFileSync(path.join(MIGRATIONS, 'README.md'), 'utf8');
  const positions = RUNNER_CHAIN.map((f) => readme.indexOf(f));
  positions.forEach((p, i) => assert.ok(p >= 0, `README does not mention ${RUNNER_CHAIN[i]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'README lists them in a different order');
});

test('--from and --only pick the right slice and reject unknown files', () => {
  assert.deepEqual(planFiles({}), RUNNER_CHAIN);
  assert.deepEqual(planFiles({ from: 'add_platform_features_migration.sql' }), RUNNER_CHAIN.slice(3));
  assert.deepEqual(planFiles({ only: 'update_rls_for_all_roles.sql' }), ['update_rls_for_all_roles.sql']);
  assert.throws(() => planFiles({ only: 'drop_everything.sql' }));
  assert.throws(() => planFiles({ from: 'nope.sql' }));
});

test('the client never ships a service-role key reference', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const offenders = walk(path.join(root, 'client', 'src'))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /service_role|SERVICE_ROLE/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
