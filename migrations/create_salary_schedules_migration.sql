-- Migration: Create salary_schedules table
-- Adds per-worker monthly salary calculation rows

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

CREATE INDEX IF NOT EXISTS idx_salary_schedules_worker_month_year ON salary_schedules(worker_id, year, month);
CREATE INDEX IF NOT EXISTS idx_salary_schedules_site ON salary_schedules(site_id);

ALTER TABLE salary_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: finance and hr roles can select/insert/update
-- Adjust role names to match your `users.role` values
CREATE POLICY "Finance and HR can manage salary schedules" ON salary_schedules
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('finance_officer','hr','system_manager')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('finance_officer','hr','system_manager')
    )
  );
