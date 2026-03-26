-- Create Deductions table for generic salary deductions
CREATE TABLE deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for performance
CREATE INDEX idx_deductions_month ON deductions(month);
CREATE INDEX idx_deductions_worker ON deductions(worker_id);

-- Enable RLS
ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for Deductions (matching advances and loans)
CREATE POLICY "Finance and Global Read Access" ON deductions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ceo', 'hr', 'finance', 'system_manager'))
);

CREATE POLICY "Finance managers can modify deductions" ON deductions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('finance', 'hr', 'system_manager'))
);
