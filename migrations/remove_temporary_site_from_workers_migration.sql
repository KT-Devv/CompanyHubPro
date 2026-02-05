-- Migration: Remove temporary_site_id from workers table
-- Temporary site is now only stored in attendance table when marking attendance
-- Run this in your Supabase SQL Editor

-- Step 1: Drop the index if it exists
DROP INDEX IF EXISTS idx_workers_temporary_site;

-- Step 2: Drop the foreign key constraint if it exists
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_temporary_site_id_fkey;

-- Step 3: Drop the temporary_site_id column
ALTER TABLE workers DROP COLUMN IF EXISTS temporary_site_id;

-- Step 4: Update comment
COMMENT ON COLUMN workers.permanent_site_id IS 'Permanent site allocation for the worker. For helpers portfolio, this is the only site. Temporary site is stored in attendance table when marking attendance.';

