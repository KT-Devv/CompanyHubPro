-- Migration: Add rate column to positions table
-- Run this SQL in your Supabase SQL Editor if you have an existing database

-- Add rate column to positions table (nullable, matching Drizzle schema)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS rate INTEGER;

