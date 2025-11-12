-- Migration: Add permanent_site_id and temporary_site_id columns to workers table
-- Run this in your Supabase SQL Editor

-- Step 1: Add permanent_site_id column
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS permanent_site_id UUID REFERENCES sites(id);

-- Step 2: Add temporary_site_id column
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS temporary_site_id UUID REFERENCES sites(id);

-- Step 3: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workers_permanent_site ON workers(permanent_site_id);
CREATE INDEX IF NOT EXISTS idx_workers_temporary_site ON workers(temporary_site_id);

-- Step 4: Add comment to document the columns
COMMENT ON COLUMN workers.permanent_site_id IS 'Permanent site allocation for the worker. For helpers portfolio, this is the only site.';
COMMENT ON COLUMN workers.temporary_site_id IS 'Temporary site marked daily for attendance. For helpers portfolio, this should match permanent_site_id.';

