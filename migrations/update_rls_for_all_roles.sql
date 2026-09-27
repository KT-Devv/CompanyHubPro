-- ============================================================
-- CANONICAL Row Level Security policies for CompanyHubPro
--
-- The browser talks to Supabase directly with the public anon key, so these
-- policies are the ONLY real access control; the role checks in the React app
-- only decide what to show.
--
-- Safe to re-run: it drops every policy on the app tables and recreates the
-- set below. Run it LAST, after any schema migration
-- (supabase-setup.sql -> fix_all_database_issues.sql ->
--  harden_transactions_and_integrity_migration.sql -> this file).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Helpers
--
-- SECURITY DEFINER so looking up the caller's own profile is not itself
-- subject to RLS. Returning text (not the enum) means the policies below never
-- reference enum labels directly, so they still create fine in the same
-- transaction that added a new enum value.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role::text FROM public.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.auth_store_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- via text so it also works if an older database stored store_id as varchar
AS $$ SELECT NULLIF(store_id::text, '')::uuid FROM public.users WHERE id = auth.uid() $$;

REVOKE ALL ON FUNCTION public.auth_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_store_id() TO authenticated;

-- ------------------------------------------------------------
-- 2. Drop every existing policy on our tables, then make sure RLS is on
-- ------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'sites', 'sectors', 'portfolios', 'positions', 'workers', 'stores', 'inventory', 'goods_log', 'invoices', 'attendance', 'salary_advances', 'loans', 'deductions', 'salary_schedules', 'worker_transfers')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_transfers ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. USERS
--
-- Read-only from the client. There is deliberately NO update/insert/delete
-- policy: a "users can update their own profile" policy lets any signed-in user
-- run  update users set role = 'ceo' where id = auth.uid()  from the browser
-- console. Profiles (role, site, store) are managed in the Supabase dashboard.
-- ------------------------------------------------------------
CREATE POLICY "Authenticated users can view users" ON users
  FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- 4. REFERENCE DATA: everyone reads, ceo / system_manager / hr write
-- ------------------------------------------------------------
CREATE POLICY "Anyone can view sites" ON sites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify sites" ON sites FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'));

CREATE POLICY "Anyone can view sectors" ON sectors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify sectors" ON sectors FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'));

CREATE POLICY "Anyone can view portfolios" ON portfolios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify portfolios" ON portfolios FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'));

CREATE POLICY "Anyone can view positions" ON positions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify positions" ON positions FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'));

CREATE POLICY "Anyone can view stores" ON stores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify stores" ON stores FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr'));

-- ------------------------------------------------------------
-- 5. WORKERS
-- Secretaries only deal with office ('non_marking') staff.
-- ------------------------------------------------------------
CREATE POLICY "Staff can view workers" ON workers FOR SELECT TO authenticated USING (
  (SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'store_manager')
  OR ((SELECT public.auth_role()) = 'secretary' AND worker_type::text = 'non_marking')
);
CREATE POLICY "HR and admins can modify workers" ON workers FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'system_manager'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'hr', 'system_manager'));

-- ------------------------------------------------------------
-- 6. ATTENDANCE
-- Payroll is computed from this table, so it is append-mostly:
--   * marking roles can INSERT, and only as themselves (marked_by is checked,
--     otherwise anyone could record attendance in someone else's name);
--   * a supervisor can change a 'Present' row to 'Half Day', nothing else;
--   * ceo / hr can correct or delete records.
-- ------------------------------------------------------------
CREATE POLICY "Staff can view attendance" ON attendance FOR SELECT TO authenticated USING (
  (SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'store_manager')
  OR ((SELECT public.auth_role()) = 'secretary' AND worker_type::text = 'non_marking')
);

CREATE POLICY "Marking roles can record attendance" ON attendance FOR INSERT TO authenticated WITH CHECK (
  marked_by = (SELECT auth.uid())
  AND (
    (SELECT public.auth_role()) IN ('ceo', 'hr', 'supervisor', 'store_manager')
    OR ((SELECT public.auth_role()) = 'secretary' AND worker_type::text = 'non_marking')
  )
);

CREATE POLICY "Supervisors can mark half days" ON attendance FOR UPDATE TO authenticated
  USING ((SELECT public.auth_role()) = 'supervisor' AND status::text = 'Present')
  WITH CHECK ((SELECT public.auth_role()) = 'supervisor' AND status::text = 'Half Day');

CREATE POLICY "HR can correct attendance" ON attendance FOR UPDATE TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'hr'));

CREATE POLICY "HR can delete attendance" ON attendance FOR DELETE TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr'));

-- ------------------------------------------------------------
-- 7. FINANCE DATA
-- ------------------------------------------------------------
-- Advances and loans: read ceo/hr/finance/system_manager, write ceo/hr/finance
CREATE POLICY "Finance can view salary advances" ON salary_advances
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'));
CREATE POLICY "Finance can modify salary advances" ON salary_advances FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance'));

CREATE POLICY "Finance can view loans" ON loans
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'));
CREATE POLICY "Finance can modify loans" ON loans FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance'));

-- Deductions and salary schedules: system_manager may also write
CREATE POLICY "Finance can view deductions" ON deductions
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'));
CREATE POLICY "Finance can modify deductions" ON deductions FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'));

CREATE POLICY "Finance can view salary schedules" ON salary_schedules
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'));
CREATE POLICY "Finance can modify salary schedules" ON salary_schedules FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager'));

-- ------------------------------------------------------------
-- 8. LOGISTICS (inventory, goods_log, invoices)
--
-- ceo / system_manager / project_manager / logistics_manager work across all
-- stores. A store_manager works on their own store only (users.store_id):
-- without this, any store manager could rewrite another store's stock.
-- Inventory stays readable to store managers everywhere because a transfer's
-- item row lives in the *sending* store.
-- ------------------------------------------------------------
CREATE POLICY "Logistics can view inventory" ON inventory FOR SELECT TO authenticated USING (
  (SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager')
);
CREATE POLICY "Logistics can modify inventory" ON inventory FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager'));
CREATE POLICY "Store managers can add to their store" ON inventory FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_role()) = 'store_manager' AND store_id = (SELECT public.auth_store_id()));
CREATE POLICY "Store managers can update their store" ON inventory FOR UPDATE TO authenticated
  USING ((SELECT public.auth_role()) = 'store_manager' AND store_id = (SELECT public.auth_store_id()))
  WITH CHECK ((SELECT public.auth_role()) = 'store_manager' AND store_id = (SELECT public.auth_store_id()));

CREATE POLICY "Logistics can view goods log" ON goods_log FOR SELECT TO authenticated USING (
  (SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager')
  OR ((SELECT public.auth_role()) = 'store_manager'
      AND (store_from = (SELECT public.auth_store_id()) OR store_to = (SELECT public.auth_store_id())))
);
CREATE POLICY "Logistics can modify goods log" ON goods_log FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager'));
-- A store can only attest to what IT did: originate a 'sent' row itself, or
-- resolve a 'received' row (including an unlisted receipt) at itself. Two
-- separate type-scoped policies, not one "store_from = mine OR store_to =
-- mine" check — that combined form let a store insert a 'sent' row naming a
-- DIFFERENT store as store_from (only store_to had to be theirs), forging a
-- shipment that looks like it came from a store that never sent anything.
CREATE POLICY "Store managers can log outgoing shipments" ON goods_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_role()) = 'store_manager' AND type = 'sent'
    AND store_from = (SELECT public.auth_store_id()));
CREATE POLICY "Store managers can log receipts" ON goods_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_role()) = 'store_manager' AND type = 'received'
    AND store_to = (SELECT public.auth_store_id()));
-- Only the receiving store can resolve (claim) a pending shipment addressed
-- to it; the sender cannot self-confirm its own outgoing log.
CREATE POLICY "Store managers can claim shipments addressed to them" ON goods_log FOR UPDATE TO authenticated
  USING ((SELECT public.auth_role()) = 'store_manager' AND status = 'pending'
    AND store_to = (SELECT public.auth_store_id()))
  WITH CHECK ((SELECT public.auth_role()) = 'store_manager'
    AND store_to = (SELECT public.auth_store_id()));

CREATE POLICY "Logistics can view invoices" ON invoices FOR SELECT TO authenticated USING (
  (SELECT public.auth_role()) IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager')
  OR ((SELECT public.auth_role()) = 'store_manager' AND store_id = (SELECT public.auth_store_id()))
);
CREATE POLICY "Logistics can modify invoices" ON invoices FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager'))
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager'));
CREATE POLICY "Store managers can add invoices for their store" ON invoices FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_role()) = 'store_manager' AND store_id = (SELECT public.auth_store_id()));

-- ------------------------------------------------------------
-- 9. WORKER TRANSFERS
--
-- Append-only audit log: INSERT + SELECT only, no UPDATE or DELETE policy at
-- all, for any role including admins. Nothing in the app ever needs to
-- change or remove a transfer record, and a log that even a compromised
-- admin session cannot rewrite is worth more than the convenience of fixing
-- a typo in place. created_by must equal the caller's own id, so a transfer
-- can't be attributed to a different, real user — this is enforced again
-- here (rpc_transfer_worker already sets it from auth.uid() itself) so a
-- direct table write, bypassing the RPC, can't forge it either.
-- ------------------------------------------------------------
CREATE POLICY "Managers can view transfers" ON worker_transfers FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr', 'project_manager'));
CREATE POLICY "Admins can record transfers" ON worker_transfers FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_role()) IN ('ceo', 'system_manager', 'hr')
    AND created_by = (SELECT auth.uid()));

COMMIT;
