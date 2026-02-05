-- Migration: Add allocated_site_id column to workers table
-- Note: Current site (where worker works on a given day) is stored in attendance table, not here
-- Run this in your Supabase SQL Editor

-- Step 1: Add allocated_site_id column
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS allocated_site_id UUID REFERENCES sites(id);

-- Step 2: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_workers_allocated_site ON workers(allocated_site_id);

-- Step 3: Add comment to document the column
COMMENT ON COLUMN workers.allocated_site_id IS 'Allocated site for the worker (where they are assigned). For helpers portfolio, this is the only site. Current site (where they work on a given day) is stored in attendance table when marking attendance.';

