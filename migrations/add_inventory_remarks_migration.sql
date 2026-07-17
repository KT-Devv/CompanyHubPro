-- Migration: Add remarks columns to inventory-related tables (safe: IF EXISTS)

ALTER TABLE IF EXISTS inventory ADD COLUMN IF NOT EXISTS remarks TEXT;
