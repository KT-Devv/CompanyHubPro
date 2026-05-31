-- Migration: Allow authorized users to UPDATE attendance
-- Run this in Supabase SQL Editor as an admin

-- Create UPDATE policy so supervisors and management roles can update attendance records
CREATE POLICY "Users can update attendance" ON attendance
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('ceo', 'hr', 'project_manager', 'supervisor')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('ceo', 'hr', 'project_manager', 'supervisor')
    )
  );

-- Optionally, confirm policy was added
-- SELECT polname, * FROM pg_policies WHERE tablename = 'attendance';
