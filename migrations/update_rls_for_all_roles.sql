-- Comprehensive RLS Update for CompanyHubPro Organogram
-- This script completely resets and updates the Row Level Security (RLS) policies
-- to support the new roles: ceo, finance, system_manager, logistics_manager, store_manager, etc.

BEGIN;

-- 1. Safely drop ALL existing RLS policies on our public tables
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('users', 'sites', 'portfolios', 'positions', 'workers', 'stores', 'inventory', 'goods_log', 'invoices', 'attendance', 'salary_advances', 'loans')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 2. Make sure RLS is enabled on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loansENABLE ROW LEVEL SECURITY;

-- 3. USERS Table
-- Everyone can read all user profiles (needed for picking who marked attendance, etc.)
CREATE POLICY "Anyone can view users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 4. READ-ONLY METADATA TABLES (sites, portfolios, positions, stores)
-- Everyone can read them. Only system_manager / ceo / hr can write to them.
CREATE POLICY "Anyone can view metadata" ON sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify sites" ON sites FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

CREATE POLICY "Anyone can view portfolios" ON portfolios FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify portfolios" ON portfolios FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

CREATE POLICY "Anyone can view positions" ON positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify positions" ON positions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

CREATE POLICY "Anyone can view stores" ON stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "System managers can modify stores" ON stores FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'hr'))
);

CREATE POLICY "Broad Read Access to Workers" ON workers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'secretary', 'store_manager'))
);

-- Write (Insert/Update/Delete): hr, system_manager, owner
CREATE POLICY "HR and System can modify workers" ON workers FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'system_manager'))
);


-- 6. ATTENDANCE Table
-- Read: ceo, owner, hr, finance, system_manager, project_manager, supervisor, secretary
CREATE POLICY "Broad Read Access to Attendance" ON attendance FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'supervisor', 'secretary'))
);

CREATE POLICY "Supervisors and HR can modify attendance" ON attendance FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'supervisor', 'secretary', 'store_manager'))
);


-- 7. FINANCE DATA (salary_advances, loans)
-- Read: ceo, owner, hr, finance, system_manager
CREATE POLICY "Finance and Global Read Access" ON salary_advances FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager'))
);
CREATE POLICY "Finance and Global Read Access" ON loans FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager'))
);

-- Write: finance, owner, hr
CREATE POLICY "Finance managers can modify advances" ON salary_advances FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr'))
);
CREATE POLICY "Finance managers can modify loans" ON loans FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'finance', 'hr'))
);


-- 8. LOGISTICS DATA (inventory, goods_log, invoices)
-- Read: ceo, owner, hr, finance, system_manager, project_manager, logistics_manager, store_manager
CREATE POLICY "Logistics Read Access" ON inventory FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Read Access" ON goods_log FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Read Access" ON invoices FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);

-- Write: logistics_manager, store_manager, owner, project_manager, system_manager
CREATE POLICY "Logistics Write Access" ON inventory FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Write Access" ON goods_log FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);
CREATE POLICY "Logistics Write Access" ON invoices FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'))
);

COMMIT;
