-- Migration: Update workers table schema
-- This migration removes the rate column, makes several fields nullable, and adds hometown and current_location fields
-- Run this in your Supabase SQL Editor

-- Step 1: Add new columns (hometown and current_location)
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS hometown TEXT,
ADD COLUMN IF NOT EXISTS current_location TEXT;

-- Step 2: Make existing columns nullable (if they are currently NOT NULL)
-- Note: These commands will fail if columns are already nullable, which is fine
DO $$
BEGIN
  -- Make name nullable
  ALTER TABLE workers ALTER COLUMN name DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- Column might already be nullable, ignore error
  NULL;
END $$;

DO $$
BEGIN
  -- Make dob nullable
  ALTER TABLE workers ALTER COLUMN dob DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make worker_type nullable
  ALTER TABLE workers ALTER COLUMN worker_type DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make date_of_employment nullable
  ALTER TABLE workers ALTER COLUMN date_of_employment DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make phone_number nullable
  ALTER TABLE workers ALTER COLUMN phone_number DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make national_id nullable
  ALTER TABLE workers ALTER COLUMN national_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make contact_person nullable
  ALTER TABLE workers ALTER COLUMN contact_person DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make cp_phone nullable
  ALTER TABLE workers ALTER COLUMN cp_phone DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Make cp_relation nullable
  ALTER TABLE workers ALTER COLUMN cp_relation DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Step 3: Remove rate column (if it exists)
ALTER TABLE workers DROP COLUMN IF EXISTS rate;

-- Step 4: Ensure foreign key constraints exist (they might already exist)
DO $$
BEGIN
  -- Add portfolio_id foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workers_portfolio_id_fkey' 
    AND conrelid = 'workers'::regclass
  ) THEN
    ALTER TABLE workers 
    ADD CONSTRAINT workers_portfolio_id_fkey 
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id);
  END IF;

  -- Add position_id foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workers_position_id_fkey' 
    AND conrelid = 'workers'::regclass
  ) THEN
    ALTER TABLE workers 
    ADD CONSTRAINT workers_position_id_fkey 
    FOREIGN KEY (position_id) REFERENCES positions(id);
  END IF;

  -- Add site_id foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workers_site_id_fkey' 
    AND conrelid = 'workers'::regclass
  ) THEN
    ALTER TABLE workers 
    ADD CONSTRAINT workers_site_id_fkey 
    FOREIGN KEY (site_id) REFERENCES sites(id);
  END IF;
END $$;

-- Step 5: Ensure indexes exist (they should already exist, but create if not)
CREATE INDEX IF NOT EXISTS idx_workers_site ON workers(site_id);
CREATE INDEX IF NOT EXISTS idx_workers_type ON workers(worker_type);

