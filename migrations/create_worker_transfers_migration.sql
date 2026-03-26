-- Migration: Create worker_transfers table

CREATE TABLE IF NOT EXISTS worker_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  from_site_id UUID,
  to_site_id UUID,
  effective_date DATE NOT NULL,
  cleared_account BOOLEAN DEFAULT false,
  old_account_number VARCHAR,
  new_account_number VARCHAR,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_transfers_worker ON worker_transfers(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_transfers_to_site ON worker_transfers(to_site_id);

ALTER TABLE worker_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can insert transfers" ON worker_transfers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('system_manager','hr')
    )
  );

CREATE POLICY "Managers can view transfers" ON worker_transfers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('system_manager','hr','project_manager')
    )
  );
