-- Migration: Migrate 'owner' role to 'ceo' and ensure attendance/workers policies allow 'ceo'
-- Run as an admin in Supabase SQL Editor

BEGIN;

-- 1) Add 'ceo' value to user_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE e.enumlabel = 'ceo' AND t.typname = 'user_role'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'ceo';
  END IF;
END$$;

-- 2) Migrate existing user rows from 'owner' -> 'ceo'
UPDATE users SET role = 'ceo' WHERE role = 'owner';

-- 3) Recreate Workers SELECT policy (drop then create)
DROP POLICY IF EXISTS "Users can view workers" ON workers;
CREATE POLICY "Users can view workers" ON workers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND (
        u.role IN ('ceo', 'hr', 'project_manager', 'supervisor', 'store_manager')
        OR (u.role = 'secretary' AND workers.worker_type = 'office')
      )
    )
  );

-- 4) Recreate Attendance SELECT and INSERT policies
DROP POLICY IF EXISTS "Users can view attendance" ON attendance;
CREATE POLICY "Users can view attendance" ON attendance
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role IN ('ceo', 'hr', 'project_manager', 'supervisor', 'store_manager')
        OR (u.role = 'secretary' AND attendance.worker_type = 'office')
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert attendance" ON attendance;
CREATE POLICY "Users can insert attendance" ON attendance
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role IN ('ceo', 'hr', 'project_manager', 'supervisor', 'secretary', 'store_manager')
      )
    )
  );

-- 5) Recreate Attendance UPDATE policy (if present)
DROP POLICY IF EXISTS "Users can update attendance" ON attendance;
CREATE POLICY "Users can update attendance" ON attendance
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('ceo', 'hr', 'project_manager', 'supervisor', 'store_manager')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('ceo', 'hr', 'project_manager', 'supervisor', 'store_manager')
    )
  );

COMMIT;

-- Notes:
-- - This script adds the 'ceo' enum value (if missing) and migrates rows from 'owner' to 'ceo'.
-- - It drops/recreates core workers/attendance policies to include 'ceo' and 'store_manager'.
-- - Review other RLS policies in your project and reapply similar replacements if you want to fully remove the old 'owner' enum value (removing enum labels requires recreating the type and is more invasive).
