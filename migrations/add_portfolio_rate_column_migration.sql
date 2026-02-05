-- Migration: Add rate column to portfolios table
-- Run this SQL in your Supabase SQL Editor if you have an existing database

-- Add rate column to portfolios table
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS rate INTEGER NOT NULL DEFAULT 0;

