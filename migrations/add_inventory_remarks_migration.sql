-- Migration: Add remarks columns to inventory-related tables (safe: IF EXISTS)

ALTER TABLE IF EXISTS inventory_items ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE IF EXISTS store_items ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE IF EXISTS store_transfers ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE IF EXISTS stores ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Enable RLS on store_transfers if table exists
DO $$
BEGIN
  IF to_regclass('public.store_transfers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE store_transfers ENABLE ROW LEVEL SECURITY';
  END IF;
END$$;
