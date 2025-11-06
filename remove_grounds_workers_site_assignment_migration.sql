-- Migration: Remove site_id column from workers table
-- Sites are ONLY tracked in attendance records when supervisors mark attendance
-- Workers should not have permanent site assignments
-- Run this in your Supabase SQL Editor

-- Step 1: Drop the foreign key constraint if it exists
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_site_id_fkey;

-- Step 2: Drop the index if it exists
DROP INDEX IF EXISTS idx_workers_site;

-- Step 3: Drop the site_id column
ALTER TABLE workers DROP COLUMN IF EXISTS site_id;

-- Step 4: Add a comment to document that sites are only in attendance records
COMMENT ON TABLE workers IS 'Workers table - site_id is NOT stored here. Sites are only tracked in attendance records when supervisors mark attendance.';

