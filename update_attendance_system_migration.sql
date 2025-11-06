-- Migration: Update attendance system for mobile workers
-- This migration updates RLS policies so supervisors can see all workers,
-- and makes site_id nullable in attendance table for Absent/Leave statuses
-- Run this in your Supabase SQL Editor

-- Step 1: Make site_id nullable in attendance table (if it's currently NOT NULL)
DO $$
BEGIN
  -- Make site_id nullable
  ALTER TABLE attendance ALTER COLUMN site_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- Column might already be nullable, ignore error
  NULL;
END $$;

-- Step 2: Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view workers" ON workers;
DROP POLICY IF EXISTS "Users can view attendance" ON attendance;

-- Step 3: Recreate Workers policy - supervisors can see all workers
CREATE POLICY "Users can view workers" ON workers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND (
        u.role IN ('owner', 'hr', 'project_manager', 'supervisor')
        OR (u.role = 'secretary' AND workers.worker_type = 'office')
      )
    )
  );

-- Step 4: Recreate Attendance policy - supervisors can see all attendance records
CREATE POLICY "Users can view attendance" ON attendance
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role IN ('owner', 'hr', 'project_manager', 'supervisor')
        OR (u.role = 'secretary' AND attendance.worker_type = 'office')
      )
    )
  );

