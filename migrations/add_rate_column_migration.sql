-- Migration: Add rate column to workers table
-- Run this SQL in your Supabase SQL Editor if you have an existing database

-- Add rate column to workers table
ALTER TABLE workers ADD COLUMN IF NOT EXISTS rate INTEGER NOT NULL DEFAULT 0;

