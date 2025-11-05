-- SiteTrack - Supabase Database Setup
-- Run this SQL in your Supabase SQL Editor to create all tables and policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('owner', 'hr', 'project_manager', 'supervisor', 'secretary');
CREATE TYPE worker_type AS ENUM ('office', 'grounds');
CREATE TYPE attendance_status AS ENUM ('Present', 'Absent', 'Leave');
CREATE TYPE goods_log_type AS ENUM ('sent', 'received');
CREATE TYPE invoice_type AS ENUM ('purchase', 'sale');

-- Sites table
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_name TEXT NOT NULL,
  is_main INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Portfolios table (for grounds workers)
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_name TEXT NOT NULL,
  ratio INTEGER NOT NULL,
  rate INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Positions table (for office workers)
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position_name TEXT NOT NULL,
  rate INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Users table (profile data for Supabase auth.users)
-- Note: Passwords are managed by Supabase Auth, NOT stored in this table
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  site_id UUID REFERENCES sites(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Workers table
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  dob DATE NOT NULL,
  worker_type worker_type NOT NULL,
  site_id UUID REFERENCES sites(id),
  portfolio_id UUID REFERENCES portfolios(id),
  position_id UUID REFERENCES positions(id),
  date_of_employment DATE NOT NULL,
  phone_number TEXT NOT NULL,
  national_id TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  cp_phone TEXT NOT NULL,
  cp_relation TEXT NOT NULL,
  rate INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Stores table
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Inventory table
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Goods Log table
CREATE TABLE goods_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES inventory(id) NOT NULL,
  store_from UUID REFERENCES stores(id),
  store_to UUID REFERENCES stores(id),
  quantity INTEGER NOT NULL,
  type goods_log_type NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  item_id UUID REFERENCES inventory(id) NOT NULL,
  amount INTEGER NOT NULL,
  supplier_name TEXT NOT NULL,
  type invoice_type NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Attendance table
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  site_id UUID REFERENCES sites(id) NOT NULL,
  date DATE NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  status attendance_status NOT NULL,
  marked_by UUID REFERENCES users(id) NOT NULL,
  worker_type worker_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(worker_id, date)
);

-- Salary Advances table
CREATE TABLE salary_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Loans table
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_workers_site ON workers(site_id);
CREATE INDEX idx_workers_type ON workers(worker_type);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_worker ON attendance(worker_id);
CREATE INDEX idx_inventory_store ON inventory(store_id);
CREATE INDEX idx_goods_log_date ON goods_log(date);
CREATE INDEX idx_invoices_date ON invoices(date);
CREATE INDEX idx_salary_advances_month ON salary_advances(month);
CREATE INDEX idx_salary_advances_worker ON salary_advances(worker_id);
CREATE INDEX idx_loans_month ON loans(month);
CREATE INDEX idx_loans_worker ON loans(worker_id);

-- Enable Row Level Security
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
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users: Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Sites: All authenticated users can read sites
CREATE POLICY "Authenticated users can view sites" ON sites
  FOR SELECT TO authenticated USING (true);

-- Portfolios: All authenticated users can read portfolios
CREATE POLICY "Authenticated users can view portfolios" ON portfolios
  FOR SELECT TO authenticated USING (true);

-- Positions: All authenticated users can read positions
CREATE POLICY "Authenticated users can view positions" ON positions
  FOR SELECT TO authenticated USING (true);

-- Workers: Users can view workers based on role
CREATE POLICY "Users can view workers" ON workers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND (
        u.role IN ('owner', 'hr', 'project_manager')
        OR (u.role = 'supervisor' AND workers.site_id = u.site_id AND workers.worker_type = 'grounds')
        OR (u.role = 'secretary' AND workers.worker_type = 'office')
      )
    )
  );

-- Stores: Management can view and manage stores
CREATE POLICY "Management can view stores" ON stores
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can insert stores" ON stores
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

-- Inventory: Management can view and manage inventory
CREATE POLICY "Management can view inventory" ON inventory
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can insert inventory" ON inventory
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can update inventory" ON inventory
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

-- Goods Log: Management can view and manage
CREATE POLICY "Management can view goods log" ON goods_log
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can insert goods log" ON goods_log
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

-- Invoices: Management can view and manage
CREATE POLICY "Management can view invoices" ON invoices
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can insert invoices" ON invoices
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

-- Attendance: Role-based access
CREATE POLICY "Users can view attendance" ON attendance
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role IN ('owner', 'hr', 'project_manager')
        OR (u.role = 'supervisor' AND attendance.site_id = u.site_id)
        OR (u.role = 'secretary' AND attendance.worker_type = 'office')
      )
    )
  );

CREATE POLICY "Users can insert attendance" ON attendance
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role IN ('owner', 'hr', 'project_manager', 'supervisor', 'secretary')
      )
    )
  );

-- Salary Advances: Management can view and manage
CREATE POLICY "Management can view salary advances" ON salary_advances
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can insert salary advances" ON salary_advances
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

-- Loans: Management can view and manage
CREATE POLICY "Management can view loans" ON loans
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

CREATE POLICY "Management can insert loans" ON loans
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'hr', 'project_manager')
    )
  );

-- Insert sample data

-- Sample sites
INSERT INTO sites (site_name, is_main) VALUES
  ('Main Office', 1),
  ('Construction Site A', 0),
  ('Construction Site B', 0);

-- Sample portfolios (for grounds workers)
INSERT INTO portfolios (portfolio_name, ratio) VALUES
  ('Mason', 100),
  ('Carpenter', 90),
  ('Laborer', 70),
  ('Electrician', 110);

-- Sample positions (for office workers)
INSERT INTO positions (position_name, rate) VALUES
  ('Accountant', 3000),
  ('Secretary', 2500),
  ('Project Coordinator', 3500),
  ('HR Manager', 4000);

-- Sample stores
INSERT INTO stores (name, location) VALUES
  ('Sunyani Store', 'Sunyani, Bono Region'),
  ('Berekum Store', 'Berekum, Bono Region'),
  ('Techiman Store', 'Techiman, Bono East Region');

-- Note: User accounts should be created through Supabase Auth UI or API
-- After creating a user via Supabase Auth, you need to insert corresponding data in the users table
-- IMPORTANT: Passwords are managed by Supabase Auth - do NOT store passwords in this table
-- Example (replace with actual user IDs from auth.users):
-- INSERT INTO users (id, email, full_name, role, site_id)
-- VALUES ('uuid-from-auth-users', 'user@example.com', 'User Name', 'owner', NULL);

-- Trigger to update inventory last_updated timestamp
CREATE OR REPLACE FUNCTION update_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_update_timestamp
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_timestamp();
