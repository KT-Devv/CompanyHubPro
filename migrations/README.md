# Database migrations

Run these in the Supabase **SQL Editor**. The app talks to Supabase directly from
the browser using the public anon key, so **Row Level Security is the only real
access control**: don't skip the last step.

## Fresh database

1. `supabase-setup.sql` – tables, enums, sample data
2. `fix_all_database_issues.sql` – brings the schema up to what the app expects
   (extra enum values and columns, sectors / transfers / deductions / salary
   schedules tables, one foreign key per `workers` column)
3. `harden_transactions_and_integrity_migration.sql` – a unique constraint,
   the `rpc_*` functions the app calls for stock and worker transfers, and a
   few policy tightenings (see the file's own header)
4. `add_platform_features_migration.sql` – payroll month close/lock and the
   frozen `payroll_lines`, the audit log and its triggers, account
   administration functions, per-item reorder levels, offline-attendance and
   invoice columns, the `app_settings` table (two-step sign-in switch)
5. `update_rls_for_all_roles.sql` – **all** RLS policies, including the ones
   steps 3 and 4 also touch, and the `auth_role()` / `mfa_ok()` helpers; this
   always runs last

Instead of pasting these into the SQL editor, `npm run migrate` applies the chain in
order (see `scripts/migrate.mjs`; it shows a plan first and only runs when you
`--confirm` the database host). `.env.staging.example` describes a staging project.

## Existing database

Run steps 2–5. All of them are safe to re-run
(`npm run migrate -- --from fix_all_database_issues.sql`).

If you ran the earlier version of `fix_all_database_issues.sql`, re-run it: that
version dropped `workers_portfolio_id_fkey` / `workers_position_id_fkey`, which
broke the `portfolios(...)` / `positions(...)` joins on every worker page. It
also left a policy that let any signed-in user set their own `role`, so re-run
`update_rls_for_all_roles.sql` too.

If you deployed the client before `harden_transactions_and_integrity_migration.sql`
was added: the client now calls `rpc_add_stock` / `rpc_send_goods` /
`rpc_receive_against_log` / `rpc_receive_unlisted` / `rpc_transfer_worker`
instead of writing to `inventory` / `goods_log` / `workers` / `worker_transfers`
directly for those operations. Deploy the client and run step 3 together —
the client will get "function does not exist" errors for stock/transfer
actions until step 3 has run.

## Rules

- `update_rls_for_all_roles.sql` is the single source of truth for policies. It
  drops every policy on the app tables and recreates them, so it must run
  **after** any schema change and must not be duplicated into other scripts.
  When a later migration needs to change a policy (as
  `harden_transactions_and_integrity_migration.sql` does), the same change is
  folded into `update_rls_for_all_roles.sql` too, or the next re-run of that
  file would silently undo it.
- The other `*_migration.sql` files are historical, one-off steps already covered
  by the scripts above. Their policies are wiped by step 4.
- There is intentionally no policy letting a user update their own `users` row.
  Roles, sites and stores are assigned in the Supabase dashboard.
- `worker_transfers` is insert + select only — nobody, including admins, can
  edit or delete a transfer record through the API. It is meant to be an
  append-only audit log.
- Sending goods, receiving goods, adding stock and transferring a worker are
  each a single `rpc_*` function call, not several separate table writes from
  the browser. Keep it that way: a function body is part of the caller's own
  transaction, so a dropped connection partway through can't leave stock
  debited with no shipment logged, or a worker moved with no transfer
  recorded. The functions are `SECURITY INVOKER` (the default) so that RLS
  keeps applying per-caller inside them — never change one to
  `SECURITY DEFINER` without re-adding every authorization check RLS was
  doing for you, since `SECURITY DEFINER` runs as the function's owner and
  normally bypasses RLS entirely.
