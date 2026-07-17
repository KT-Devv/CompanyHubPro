-- ============================================================
-- CATCH-UP MIGRATION: Fix all database issues
-- Run this ONCE in Supabase SQL Editor
-- Safe to run on existing databases (uses IF NOT EXISTS)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ADD MISSING ENUM VALUES
-- ============================================================

-- Add missing values to user_role enum
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
-- 7. DROP duplicate FK constraints on workers
-- ============================================================

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_portfolio_id_fkey;
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_position_id_fkey;

-- ============================================================
-- 8. RESET ALL RLS POLICIES
-- This completely replaces all policies with the correct set.
-- ============================================================

-- Drop ALL existing policies on our tables
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

-- USERS
CREATE POLICY "Anyone can view users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- SITES
CREATE POLICY "Anyone can view metadata" ON sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify sites" ON sites FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

-- SECTORS
CREATE POLICY "Anyone can view sectors" ON sectors FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify sectors" ON sectors FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

-- PORTFOLIOS
CREATE POLICY "Anyone can view portfolios" ON portfolios FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify portfolios" ON portfolios FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

-- POSITIONS
CREATE POLICY "Anyone can view positions" ON positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify positions" ON positions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

-- WORKERS
CREATE POLICY "Broad Read Access to Workers" ON workers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'secretary', 'store_manager'))
);
CREATE POLICY "HR and System can modify workers" ON workers FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'system_manager'))
);

-- STORES
CREATE POLICY "Anyone can view stores" ON stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify stores" ON stores FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

-- INVENTORY
CREATE POLICY "Logistics Read Access" ON inventory FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Write Access" ON inventory FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);

-- GOODS LOG
CREATE POLICY "Logistics Read Access" ON goods_log FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Write Access" ON goods_log FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);

-- INVOICES
CREATE POLICY "Logistics Read Access" ON invoices FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Write Access" ON invoices FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);

-- ATTENDANCE
CREATE POLICY "Broad Read Access to Attendance" ON attendance FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'secretary'))
);
CREATE POLICY "Supervisors and HR can modify attendance" ON attendance FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'supervisor', 'secretary', 'store_manager'))
);

-- SALARY ADVANCES
CREATE POLICY "Finance Read Access" ON salary_advances FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager'))
);
CREATE POLICY "Finance Write Access" ON salary_advances FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr'))
);

-- LOANS
CREATE POLICY "Finance Read Access" ON loans FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager'))
);
CREATE POLICY "Finance Write Access" ON loans FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr'))
);

-- DEDUCTIONS
CREATE POLICY "Finance Read Access" ON deductions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager'))
);
CREATE POLICY "Finance Write Access" ON deductions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr', 'system_manager'))
);

-- SALARY SCHEDULES
CREATE POLICY "Finance Read Access" ON salary_schedules FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr', 'system_manager'))
);
CREATE POLICY "Finance Write Access" ON salary_schedules FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr', 'system_manager'))
);

-- WORKER TRANSFERS
CREATE POLICY "Managers can view transfers" ON worker_transfers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr', 'project_manager'))
);
CREATE POLICY "Managers can modify transfers" ON worker_transfers FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

COMMIT;
