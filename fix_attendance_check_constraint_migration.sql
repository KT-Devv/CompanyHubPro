-- Migration: Remove attendance status check constraint
-- This removes the hardcoded check that only allows Present/Absent/Leave
-- The enum type now handles validation, allowing "Half Day"
-- Run this in your Supabase SQL Editor

-- Drop the restrictive CHECK constraint
ALTER TABLE attendance DROP CONSTRAINT check_attendance_status_valid;

-- Optional: Add a new CHECK constraint that uses the enum range (more flexible)
-- This allows any valid enum value without hardcoding them
ALTER TABLE attendance 
ADD CONSTRAINT check_attendance_status_valid 
CHECK (status = ANY(enum_range(NULL::attendance_status)));
