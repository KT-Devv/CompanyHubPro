-- Migration: Add "Half Day" to attendance status enum
-- This allows marking workers as "Half Day" for partial attendance
-- Run this in your Supabase SQL Editor

-- Add "Half Day" to the attendance_status enum
ALTER TYPE attendance_status ADD VALUE 'Half Day';