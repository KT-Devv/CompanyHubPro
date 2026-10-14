import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ROLES, can, canAccess, homePathForRole, LEGACY_REDIRECTS, ROUTE_ROLES, type AppRoute } from './roles';

test('every role has a home page it can open (no redirect loops)', () => {
  for (const role of ALL_ROLES) {
    const home = homePathForRole(role);
    assert.ok(home, `${role} has no home`);
    assert.ok(canAccess(role, home!), `${role} cannot open its own home`);
  }
});

test('unknown or missing roles get no home and no access', () => {
  assert.equal(homePathForRole(null), null);
  assert.equal(homePathForRole('intern'), null);
  assert.equal(canAccess(undefined, '/finance'), false);
  assert.equal(canAccess('intern', '/'), false);
});

test('every route lists only known roles', () => {
  for (const [path, roles] of Object.entries(ROUTE_ROLES)) {
    for (const role of roles) assert.ok(ALL_ROLES.includes(role), `${path}: unknown role ${role}`);
  }
});

test('every role can reach at least one page besides the dashboard', () => {
  for (const role of ALL_ROLES) {
    const pages = (Object.keys(ROUTE_ROLES) as AppRoute[]).filter((p) => p !== '/' && canAccess(role, p));
    assert.ok(pages.length > 0, `${role} would land on an empty dashboard`);
  }
});

test('legacy links redirect to routes that exist', () => {
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    assert.ok(to in ROUTE_ROLES, `${from} -> ${to} does not exist`);
    assert.ok(!(from in ROUTE_ROLES), `${from} is both legacy and current`);
  }
});

test('attendance: who marks, who reviews, who may back-fill', () => {
  // Field roles mark but do not review.
  for (const r of ['supervisor', 'secretary', 'store_manager']) {
    assert.ok(canAccess(r, '/attendance'));
    assert.ok(!canAccess(r, '/attendance/records'));
  }
  // HR and the system manager both mark and review.
  for (const r of ['hr', 'system_manager']) {
    assert.ok(canAccess(r, '/attendance'));
    assert.ok(canAccess(r, '/attendance/records'));
  }
  // The CEO reviews only: read-only for attendance.
  assert.ok(canAccess('ceo', '/attendance/records'));
  assert.ok(!canAccess('ceo', '/attendance'));
  // A project manager only reviews.
  assert.ok(canAccess('project_manager', '/attendance/records'));
  assert.ok(!canAccess('project_manager', '/attendance'));
  // Roles that never touch attendance.
  for (const r of ['finance', 'logistics_manager']) assert.ok(!canAccess(r, '/attendance'));
  // Only HR and the system manager may mark an earlier day.
  for (const r of ALL_ROLES) assert.equal(can(r, 'backfillAttendance'), r === 'hr' || r === 'system_manager', r);
});

test('write permissions match what the database allows', () => {
  // These mirror update_rls_for_all_roles.sql; the CEO is read-only in the UI.
  assert.ok(can('finance', 'addAdvanceOrLoan'));
  assert.ok(!can('system_manager', 'addAdvanceOrLoan'), 'RLS rejects system_manager advances');
  assert.ok(can('system_manager', 'addDeduction'));
  assert.ok(!can('project_manager', 'transferWorkers'), 'RLS rejects project_manager transfers');
  assert.ok(can('hr', 'transferWorkers'));
  assert.ok(!can('ceo', 'editWorkers'));
  assert.ok(can('supervisor', 'markHalfDay'));
  assert.ok(!can('secretary', 'markHalfDay'));
});
