-- ============================================================
-- CATCH-UP MIGRATION: Fix all database issues
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / idempotent).
--
-- This script only fixes SCHEMA. It deliberately does not touch RLS policies:
-- run update_rls_for_all_roles.sql AFTER it, which is the single source of
-- truth for policies. (Two scripts each defining the full policy set drifted
-- apart, and both shipped a policy letting any user promote themselves to CEO.)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ADD MISSING ENUM VALUES
-- ============================================================

-- Add missing values to user_role enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'ceo' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'ceo';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'project_manager' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'project_manager';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'secretary' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'secretary';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'finance' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'finance';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'system_manager' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'system_manager';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'logistics_manager' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'logistics_manager';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'store_manager' AND t.typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE 'store_manager';
  END IF;
END $$;

-- Add missing values to worker_type enum (casual/non_marking)
-- NOTE: We cannot remove old values (office/grounds) from a PostgreSQL enum.
-- The app only uses casual/non_marking, so ensure they exist.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'casual' AND t.typname = 'worker_type') THEN
    ALTER TYPE worker_type ADD VALUE 'casual';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'non_marking' AND t.typname = 'worker_type') THEN
    ALTER TYPE worker_type ADD VALUE 'non_marking';
  END IF;
END $$;

-- Add 'Half Day' to attendance_status if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE e.enumlabel = 'Half Day' AND t.typname = 'attendance_status') THEN
    ALTER TYPE attendance_status ADD VALUE 'Half Day';
  END IF;
END $$;

-- Create goods_log_status enum if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goods_log_status') THEN
    CREATE TYPE goods_log_status AS ENUM ('pending', 'matched', 'error');
  END IF;
END $$;

-- ============================================================
-- 2. ADD MISSING COLUMNS
-- ============================================================

-- users.store_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id UUID;

-- sites.sector_id
ALTER TABLE sites ADD COLUMN IF NOT EXISTS sector_id UUID;

-- workers.site_id
ALTER TABLE workers ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id);

-- workers.account_location
ALTER TABLE workers ADD COLUMN IF NOT EXISTS account_location UUID REFERENCES sites(id);

-- workers.account_number
ALTER TABLE workers ADD COLUMN IF NOT EXISTS account_number TEXT;

-- inventory.remarks
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS remarks TEXT;

-- goods_log.status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goods_log' AND column_name = 'status') THEN
    ALTER TABLE goods_log ADD COLUMN status goods_log_status NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- goods_log.reference_id
ALTER TABLE goods_log ADD COLUMN IF NOT EXISTS reference_id VARCHAR;

-- goods_log.remarks
ALTER TABLE goods_log ADD COLUMN IF NOT EXISTS remarks TEXT;

-- invoices.quantity
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- 3. CREATE MISSING TABLES
-- ============================================================

-- sectors table
CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Sites may already carry a sector_id from before the sectors table existed.
-- Adding the FK over those orphaned ids fails, so give each one a placeholder
-- sector (same id, so every site keeps its grouping). Rename them afterwards:
--   select id, sector_name from sectors where sector_name like 'Unnamed sector%';
INSERT INTO sectors (id, sector_name)
SELECT DISTINCT s.sector_id, 'Unnamed sector ' || left(s.sector_id::text, 8)
FROM sites s
WHERE s.sector_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sectors x WHERE x.id = s.sector_id);

-- Add FK for sites.sector_id if not already present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sites_sector_id') THEN
    ALTER TABLE sites ADD CONSTRAINT fk_sites_sector_id FOREIGN KEY (sector_id) REFERENCES sectors(id);
  END IF;
END $$;

-- worker_transfers table
CREATE TABLE IF NOT EXISTS worker_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  from_site_id UUID REFERENCES sites(id),
  to_site_id UUID REFERENCES sites(id),
  effective_date DATE NOT NULL,
  cleared_account BOOLEAN DEFAULT false,
  old_account_number VARCHAR,
  new_account_number VARCHAR,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- deductions table
CREATE TABLE IF NOT EXISTS deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- salary_schedules table
CREATE TABLE IF NOT EXISTS salary_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  site_id UUID REFERENCES sites(id),
  portfolio_id UUID,
  position_id UUID,
  month SMALLINT NOT NULL,
  year SMALLINT NOT NULL,
  days_present NUMERIC DEFAULT 0,
  rate NUMERIC(12,2) DEFAULT 0,
  account_location UUID,
  account_number VARCHAR,
  gross_amount NUMERIC(12,2) DEFAULT 0,
  deductions JSONB DEFAULT '{}'::jsonb,
  net_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Tables created here start with RLS on and NO policies (deny everything)
-- until update_rls_for_all_roles.sql runs. A table left without RLS is fully
-- readable and writable with the public anon key.
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. ADD MISSING INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_workers_site_id ON workers(site_id);
CREATE INDEX IF NOT EXISTS idx_deductions_month ON deductions(month);
CREATE INDEX IF NOT EXISTS idx_deductions_worker ON deductions(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_transfers_worker ON worker_transfers(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_transfers_to_site ON worker_transfers(to_site_id);
CREATE INDEX IF NOT EXISTS idx_salary_schedules_worker_month_year ON salary_schedules(worker_id, year, month);
CREATE INDEX IF NOT EXISTS idx_salary_schedules_site ON salary_schedules(site_id);

-- ============================================================
-- 5. DROP BAD CHECK CONSTRAINTS
-- ============================================================

-- Remove hardcoded worker_type CHECK (app uses casual/non_marking, not office/grounds)
ALTER TABLE workers DROP CONSTRAINT IF EXISTS check_worker_type_valid;

-- Remove hardcoded attendance status CHECK (should use enum_range, not hardcoded list)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS check_attendance_status_valid;

-- Make attendance.site_id nullable (required for Absent/Leave)
DO $$ BEGIN
  ALTER TABLE attendance ALTER COLUMN site_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 6. DROP portfolios.ratio IF EXISTS (not in Drizzle schema)
-- ============================================================

ALTER TABLE portfolios DROP COLUMN IF EXISTS ratio;

-- ============================================================
-- 7. FOREIGN KEYS ON workers: exactly one per column
--
-- PostgREST needs a foreign key to embed portfolios(...) / positions(...) /
-- sites!site_id(...) in the worker queries, and errors out if a column has
-- two of them. So: drop true duplicates only (same column, same target table),
-- then re-add any FK that is missing. (An earlier version of this script
-- dropped workers_portfolio_id_fkey / workers_position_id_fkey outright, which
-- removed the only FK and broke every worker page; re-running fixes that.)
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM (
      SELECT c.conname,
             row_number() OVER (PARTITION BY c.conkey, c.confrelid ORDER BY c.conname) AS rn
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.conrelid = 'public.workers'::regclass
    ) fks
    WHERE rn > 1
  ) LOOP
    EXECUTE format('ALTER TABLE public.workers DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN (
    SELECT * FROM (VALUES
      ('portfolio_id',     'portfolios', 'workers_portfolio_id_fkey'),
      ('position_id',      'positions',  'workers_position_id_fkey'),
      ('site_id',          'sites',      'workers_site_id_fkey'),
      ('account_location', 'sites',      'workers_account_location_fkey')
    ) AS t(col, ref_table, cname)
  ) LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.workers'::regclass
        AND c.confrelid = ('public.' || spec.ref_table)::regclass
        AND a.attname = spec.col
    ) THEN
      -- NOT VALID: enforced for new/changed rows but existing rows aren't
      -- checked, so leftover orphans (e.g. a worker pointing at a deleted
      -- portfolio) can't abort the whole migration. PostgREST still uses the
      -- constraint for joins. Find orphans with a query like
      --   select id from workers where portfolio_id not in (select id from portfolios);
      -- fix them, then: alter table workers validate constraint <name>;
      EXECUTE format(
        'ALTER TABLE public.workers ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) NOT VALID',
        spec.cname, spec.col, spec.ref_table
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 8. ENABLE ROW LEVEL SECURITY ON EVERY TABLE
-- Policies live in update_rls_for_all_roles.sql: run that next.
-- ============================================================

-- Enable RLS on all tables
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
COMMIT;
