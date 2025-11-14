-- Migration: Rename permanent_site_id to allocated_site_id in workers table
-- Also update comments to reflect new naming (allocated site vs current site)
-- Run this in your Supabase SQL Editor

-- Step 1: Rename the column
ALTER TABLE workers 
RENAME COLUMN permanent_site_id TO allocated_site_id;

-- Step 2: Rename the index if it exists
DROP INDEX IF EXISTS idx_workers_permanent_site;
CREATE INDEX IF NOT EXISTS idx_workers_allocated_site ON workers(allocated_site_id);

-- Step 3: Update comments
COMMENT ON COLUMN workers.allocated_site_id IS 'Allocated site for the worker (where they are assigned). For helpers portfolio, this is the only site. Current site (where they work on a given day) is stored in attendance table when marking attendance.';

COMMENT ON COLUMN attendance.site_id IS 'Current site selected when marking attendance (for Present status). This is the site the worker is working at for that specific day. For helpers, this will be the same as their allocated site.';

