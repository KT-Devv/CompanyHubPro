-- Migration: Add salary_advances and loans tables
-- Run this SQL in your Supabase SQL Editor if you have an existing database

-- Salary Advances table
CREATE TABLE IF NOT EXISTS salary_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Loans table
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_salary_advances_month ON salary_advances(month);
CREATE INDEX IF NOT EXISTS idx_salary_advances_worker ON salary_advances(worker_id);
CREATE INDEX IF NOT EXISTS idx_loans_month ON loans(month);
CREATE INDEX IF NOT EXISTS idx_loans_worker ON loans(worker_id);

-- Enable Row Level Security
ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

