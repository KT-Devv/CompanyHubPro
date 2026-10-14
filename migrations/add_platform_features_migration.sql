-- ============================================================
-- PLATFORM FEATURES: audit log, payroll month close, bank details, account
-- administration, two-step sign-in enforcement, reorder levels, realtime.
--
-- Run AFTER harden_transactions_and_integrity_migration.sql and BEFORE
-- update_rls_for_all_roles.sql (which carries every policy for the tables
-- created here, and the auth_role()/mfa_ok() helpers this file's functions
-- call at run time).
--
-- Everything here is additive and safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
-- Payroll is paid by bank, so every worker (not just casual) needs bank details.
ALTER TABLE public.workers   ADD COLUMN IF NOT EXISTS bank_name text;
-- Deactivating an account cuts off database access immediately (auth_role()
-- returns NULL for an inactive user, so every role-based policy denies).
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
-- Per-item reorder level + when the last low-stock alert went out.
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS min_quantity integer NOT NULL DEFAULT 10;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS low_alerted_at timestamptz;
-- Marks made with no signal are saved on the phone and synced later. The row's
-- own "timestamp" is the sync time; this records when the supervisor tapped.
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS offline_marked_at timestamptz;
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_min_quantity_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_min_quantity_check CHECK (min_quantity >= 0);
  END IF;
  -- NOT VALID: enforced for new rows without failing on any old row.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_positive_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_positive_check CHECK (amount > 0 AND quantity > 0) NOT VALID;
  END IF;
END $$;

-- The invoice's author is always the signed-in user, never a client-supplied id.
CREATE OR REPLACE FUNCTION public.set_created_by() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_set_created_by ON public.invoices;
CREATE TRIGGER invoices_set_created_by BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ------------------------------------------------------------
-- 2. App settings (changed only through rpc_set_setting)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (key, value) VALUES ('require_mfa', 'false') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rpc_set_setting(p_key text, p_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'ceo' THEN
    RAISE EXCEPTION 'Only the CEO can change settings' USING ERRCODE = '42501';
  END IF;
  IF p_key <> 'require_mfa' THEN
    RAISE EXCEPTION 'Unknown setting' USING ERRCODE = '22023';
  END IF;
  IF p_value NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'Value must be true or false' USING ERRCODE = '22023';
  END IF;
  -- Never let the person flipping the switch lock themselves out: they must
  -- already be signed in with a verified second factor.
  IF p_value = 'true' AND COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Set up and verify two-step sign-in on your own account first' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.app_settings (key, value) VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.rpc_set_setting(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_setting(text, text) TO authenticated;

-- ------------------------------------------------------------
-- 3. Audit log: who changed what, and when
--
-- Written by a trigger (SECURITY DEFINER, so it can write to a table nobody
-- can write to directly). Nobody can update or delete it through the API:
-- the table has no write policies at all.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         bigserial PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  table_name text NOT NULL,
  row_id     text,
  action     text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON public.audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_row ON public.audit_log (table_name, row_id);

CREATE OR REPLACE FUNCTION public.audit_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_src jsonb;
  v_id  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- A no-op update (nothing actually changed) isn't worth a log row.
    IF v_old = v_new THEN RETURN NEW; END IF;
  ELSE
    v_old := to_jsonb(OLD);
  END IF;

  v_src := COALESCE(v_new, v_old);
  v_id := COALESCE(
    v_src ->> 'id',
    CASE WHEN v_src ? 'month' AND v_src ? 'worker_id' THEN (v_src ->> 'month') || ':' || (v_src ->> 'worker_id') END,
    v_src ->> 'key',
    v_src ->> 'month'
  );

  INSERT INTO public.audit_log (changed_by, table_name, row_id, action, old_data, new_data)
  VALUES (auth.uid(), TG_TABLE_NAME, v_id, TG_OP, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;

-- (The triggers themselves are attached in section 6, once every table they
-- watch exists.)

-- ------------------------------------------------------------
-- 4. Payroll: the single, authoritative calculation, and month close
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  month            text PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  closed_at        timestamptz NOT NULL DEFAULT now(),
  closed_by        uuid NOT NULL,
  workers          integer NOT NULL DEFAULT 0,
  gross            numeric(14, 2) NOT NULL DEFAULT 0,
  total_deductions numeric(14, 2) NOT NULL DEFAULT 0,
  net              numeric(14, 2) NOT NULL DEFAULT 0
);

-- A frozen copy of every line as it was when the month closed, so later changes
-- to rates, attendance or a worker's bank details can't rewrite a paid month.
CREATE TABLE IF NOT EXISTS public.payroll_lines (
  month            text NOT NULL REFERENCES public.payroll_periods (month) ON DELETE CASCADE,
  worker_id        uuid NOT NULL,
  worker_name      text,
  worker_type      text NOT NULL,
  national_id      text,
  site_name        text,
  job_title        text,
  rate             numeric(12, 2) NOT NULL,
  days_present     numeric(6, 1) NOT NULL,
  fixed            boolean NOT NULL,
  gross            numeric(12, 2) NOT NULL,
  ssnit            numeric(12, 2) NOT NULL,
  tax              numeric(12, 2) NOT NULL,
  advances         numeric(12, 2) NOT NULL,
  loans            numeric(12, 2) NOT NULL,
  other_deductions numeric(12, 2) NOT NULL,
  total_deductions numeric(12, 2) NOT NULL,
  net              numeric(12, 2) NOT NULL,
  overdrawn        boolean NOT NULL,
  bank_name        text,
  account_site     text,
  account_number   text,
  PRIMARY KEY (month, worker_id)
);

CREATE TABLE IF NOT EXISTS public.payroll_reopens (
  id          bigserial PRIMARY KEY,
  month       text NOT NULL,
  reopened_by uuid NOT NULL,
  reopened_at timestamptz NOT NULL DEFAULT now(),
  reason      text NOT NULL
);

-- Rates here must match SSNIT_RATE / TAX_RATE in client/src/lib/payroll.ts; a
-- test runs both against the same data to keep them from drifting apart.
-- NUMERIC arithmetic throughout (no floating point), rounded to pesewas at each
-- step, exactly as the client does.
CREATE OR REPLACE FUNCTION public.payroll_compute(p_month text)
RETURNS TABLE (
  worker_id uuid, worker_name text, worker_type text, national_id text,
  site_name text, job_title text, rate numeric, days_present numeric, fixed boolean,
  gross numeric, ssnit numeric, tax numeric, advances numeric, loans numeric,
  other_deductions numeric, total_deductions numeric, net numeric, overdrawn boolean,
  bank_name text, account_site text, account_number text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT to_date(p_month || '-01', 'YYYY-MM-DD') AS d0
  ),
  att AS (
    SELECT a.worker_id AS wid,
           sum(CASE a.status::text WHEN 'Present' THEN 1 WHEN 'Half Day' THEN 0.5 ELSE 0 END)::numeric AS n
    FROM public.attendance a, m
    WHERE a.date >= m.d0 AND a.date < (m.d0 + interval '1 month')
    GROUP BY a.worker_id
  ),
  adv AS (SELECT x.worker_id AS wid, sum(x.amount)::numeric AS t FROM public.salary_advances x WHERE x.month = p_month GROUP BY x.worker_id),
  lns AS (SELECT x.worker_id AS wid, sum(x.amount)::numeric AS t FROM public.loans x WHERE x.month = p_month GROUP BY x.worker_id),
  ded AS (SELECT x.worker_id AS wid, sum(x.amount)::numeric AS t FROM public.deductions x WHERE x.month = p_month GROUP BY x.worker_id),
  base AS (
    SELECT w.id AS wid, w.name AS wname, w.worker_type::text AS wtype, w.national_id AS nid,
           s.site_name AS sname,
           CASE WHEN w.worker_type::text = 'non_marking' THEN pos.position_name ELSE pf.portfolio_name END AS job,
           COALESCE(CASE WHEN w.worker_type::text = 'non_marking' THEN pos.rate ELSE pf.rate END, 0)::numeric AS r,
           CASE WHEN w.worker_type::text = 'non_marking' THEN 0 ELSE COALESCE(att.n, 0) END AS dp,
           COALESCE(adv.t, 0) AS a_t, COALESCE(lns.t, 0) AS l_t, COALESCE(ded.t, 0) AS d_t,
           w.bank_name AS bname, acc.site_name AS asite, w.account_number AS anum
    FROM public.workers w
    LEFT JOIN public.sites s      ON s.id = w.site_id
    LEFT JOIN public.sites acc    ON acc.id = w.account_location
    LEFT JOIN public.portfolios pf ON pf.id = w.portfolio_id
    LEFT JOIN public.positions pos ON pos.id = w.position_id
    LEFT JOIN att ON att.wid = w.id
    LEFT JOIN adv ON adv.wid = w.id
    LEFT JOIN lns ON lns.wid = w.id
    LEFT JOIN ded ON ded.wid = w.id
    WHERE w.worker_type::text IN ('casual', 'non_marking')
  ),
  g AS (SELECT b.*, round(CASE WHEN b.wtype = 'non_marking' THEN b.r ELSE b.dp * b.r END, 2) AS gr FROM base b),
  s AS (SELECT g.*, round(g.gr * 0.055, 2) AS ss FROM g),
  t AS (SELECT s.*, round(greatest(0, s.gr - s.ss) * 0.10, 2) AS tx FROM s),
  f AS (SELECT t.*, round(t.ss + t.tx + t.a_t + t.l_t + t.d_t, 2) AS td FROM t)
  SELECT f.wid, COALESCE(f.wname, ''), f.wtype, f.nid,
         f.sname, f.job, f.r, f.dp, (f.wtype = 'non_marking'),
         f.gr, f.ss, f.tx, f.a_t, f.l_t,
         f.d_t, f.td, round(greatest(0, f.gr - f.td), 2), (f.td > f.gr),
         f.bname, f.asite, f.anum
  FROM f
  ORDER BY COALESCE(f.wname, ''), f.wid
$$;

REVOKE ALL ON FUNCTION public.payroll_compute(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_compute(text) TO authenticated;

-- A closed month's attendance and pay entries can no longer be added, changed
-- or removed (not even by HR or the CEO) until the month is reopened.
CREATE OR REPLACE FUNCTION public.guard_closed_month() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  IF TG_TABLE_NAME = 'attendance' THEN
    IF TG_OP <> 'INSERT' THEN v_old := to_char(OLD.date, 'YYYY-MM'); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_char(NEW.date, 'YYYY-MM'); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old := OLD.month; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := NEW.month; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.payroll_periods WHERE month IN (v_old, v_new)) THEN
    RAISE EXCEPTION 'Payroll for that month is closed. Reopen it first to change this record.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.guard_closed_month() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance', 'salary_advances', 'loans', 'deductions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_closed_month ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER guard_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.guard_closed_month()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_close_payroll(p_month text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.auth_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('ceo', 'hr', 'finance') THEN
    RAISE EXCEPTION 'You do not have permission to close payroll' USING ERRCODE = '42501';
  END IF;
  IF NOT public.mfa_ok() THEN
    RAISE EXCEPTION 'Two-step sign-in is required for this action' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Month must look like 2026-09' USING ERRCODE = '22023';
  END IF;
  -- Attendance can still be marked for a few days after a month ends (late
  -- supervisors), so a month may only be closed once it is over.
  IF p_month >= to_char(timezone('UTC', now()), 'YYYY-MM') THEN
    RAISE EXCEPTION 'A month can only be closed after it has ended' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payroll_periods WHERE month = p_month) THEN
    RAISE EXCEPTION 'That month is already closed' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.payroll_periods (month, closed_by) VALUES (p_month, auth.uid());

  INSERT INTO public.payroll_lines (
    month, worker_id, worker_name, worker_type, national_id, site_name, job_title, rate,
    days_present, fixed, gross, ssnit, tax, advances, loans, other_deductions,
    total_deductions, net, overdrawn, bank_name, account_site, account_number
  )
  SELECT p_month, c.worker_id, c.worker_name, c.worker_type, c.national_id, c.site_name, c.job_title, c.rate,
         c.days_present, c.fixed, c.gross, c.ssnit, c.tax, c.advances, c.loans, c.other_deductions,
         c.total_deductions, c.net, c.overdrawn, c.bank_name, c.account_site, c.account_number
  FROM public.payroll_compute(p_month) c;

  UPDATE public.payroll_periods p
     SET workers = x.n, gross = x.g, total_deductions = x.d, net = x.net
    FROM (
      SELECT count(*)::integer AS n, COALESCE(sum(gross), 0) AS g,
             COALESCE(sum(total_deductions), 0) AS d, COALESCE(sum(net), 0) AS net
      FROM public.payroll_lines WHERE month = p_month
    ) x
   WHERE p.month = p_month;
END $$;

REVOKE ALL ON FUNCTION public.rpc_close_payroll(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_close_payroll(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_reopen_payroll(p_month text, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'ceo' THEN
    RAISE EXCEPTION 'Only the CEO can reopen a closed month' USING ERRCODE = '42501';
  END IF;
  IF NOT public.mfa_ok() THEN
    RAISE EXCEPTION 'Two-step sign-in is required for this action' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Give a reason (at least 5 characters) for reopening' USING ERRCODE = '22023';
  END IF;

  -- The reason is recorded first; the frozen lines are logged to audit_log row
  -- by row as they are deleted (cascade), so nothing about the closed month
  -- is lost.
  INSERT INTO public.payroll_reopens (month, reopened_by, reason) VALUES (p_month, auth.uid(), btrim(p_reason));

  DELETE FROM public.payroll_periods WHERE month = p_month;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That month is not closed' USING ERRCODE = 'P0002';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.rpc_reopen_payroll(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reopen_payroll(text, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. Account administration
--
-- Roles, sites and stores are changed here, never by a plain UPDATE on users
-- (there is deliberately no such policy: that would let anyone promote
-- themselves). Creating a login needs the auth admin API, so inviting someone
-- is done by the admin-users edge function; this function covers everything
-- about an account that already exists.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_update_user(
  p_user_id uuid,
  p_role text,
  p_site_id uuid,
  p_store_id uuid,
  p_is_active boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller text := public.auth_role();
  v_target public.users%ROWTYPE;
  v_role public.user_role;
BEGIN
  IF v_caller IS NULL OR v_caller NOT IN ('ceo', 'system_manager') THEN
    RAISE EXCEPTION 'You do not have permission to manage accounts' USING ERRCODE = '42501';
  END IF;
  IF NOT public.mfa_ok() THEN
    RAISE EXCEPTION 'Two-step sign-in is required for this action' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own account' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    v_role := p_role::public.user_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END;

  IF (v_target.role = 'ceo' OR v_role = 'ceo') AND v_caller <> 'ceo' THEN
    RAISE EXCEPTION 'Only the CEO can change a CEO account or grant that role' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'store_manager' AND p_store_id IS NULL THEN
    RAISE EXCEPTION 'A store manager needs a store' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'supervisor' AND p_site_id IS NULL THEN
    RAISE EXCEPTION 'A supervisor needs a site' USING ERRCODE = '22023';
  END IF;
  IF p_site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id) THEN
    RAISE EXCEPTION 'That site does not exist' USING ERRCODE = '22023';
  END IF;
  IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
    RAISE EXCEPTION 'That store does not exist' USING ERRCODE = '22023';
  END IF;
  IF v_target.role = 'ceo' AND v_target.is_active AND (v_role <> 'ceo' OR NOT p_is_active)
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'ceo' AND is_active AND id <> p_user_id) THEN
    RAISE EXCEPTION 'There must always be at least one active CEO' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
     SET role = v_role, site_id = p_site_id, store_id = p_store_id, is_active = COALESCE(p_is_active, is_active)
   WHERE id = p_user_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_admin_update_user(uuid, text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_user(uuid, text, uuid, uuid, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 6. Audit triggers (all the tables above now exist)
--
-- Everything that changes pay, people or money. Attendance inserts are the
-- day-to-day firehose (and are already attributed by marked_by), so only
-- corrections to attendance are logged.
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workers', 'users', 'salary_advances', 'loans', 'deductions', 'salary_schedules',
    'portfolios', 'positions', 'sites', 'stores', 'invoices', 'app_settings',
    'payroll_periods', 'payroll_reopens'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t);
  END LOOP;

  -- Attendance: corrections only. Frozen payroll lines: deletions only.
  DROP TRIGGER IF EXISTS audit_row ON public.attendance;
  CREATE TRIGGER audit_row AFTER UPDATE OR DELETE ON public.attendance
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
  DROP TRIGGER IF EXISTS audit_row ON public.payroll_lines;
  CREATE TRIGGER audit_row AFTER DELETE ON public.payroll_lines
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
END $$;

-- ------------------------------------------------------------
-- 7. Realtime: live attendance and stock without polling
-- (Row-level security still decides who receives which change.)
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['attendance', 'goods_log', 'inventory'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;
