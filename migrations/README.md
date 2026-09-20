# Database migrations

Run these in the Supabase **SQL Editor**. The app talks to Supabase directly from
the browser using the public anon key, so **Row Level Security is the only real
access control**: don't skip the last step.

## Fresh database

1. `supabase-setup.sql` – tables, enums, sample data
2. `fix_all_database_issues.sql` – brings the schema up to what the app expects
   (extra enum values and columns, sectors / transfers / deductions / salary
   schedules tables, one foreign key per `workers` column)
3. `update_rls_for_all_roles.sql` – **all** RLS policies

## Existing database

Run steps 2 and 3. Both are safe to re-run.

If you ran the earlier version of `fix_all_database_issues.sql`, re-run it: that
version dropped `workers_portfolio_id_fkey` / `workers_position_id_fkey`, which
broke the `portfolios(...)` / `positions(...)` joins on every worker page. It
also left a policy that let any signed-in user set their own `role`, so re-run
`update_rls_for_all_roles.sql` too.

## Rules

- `update_rls_for_all_roles.sql` is the single source of truth for policies. It
  drops every policy on the app tables and recreates them, so it must run
  **after** any schema change and must not be duplicated into other scripts.
- The other `*_migration.sql` files are historical, one-off steps already covered
  by the scripts above. Their policies are wiped by step 3.
- There is intentionally no policy letting a user update their own `users` row.
  Roles, sites and stores are assigned in the Supabase dashboard.
