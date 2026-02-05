-- Migration: Make attendance.site_id nullable and enforce presence requirement only for Present status

ALTER TABLE attendance
  ALTER COLUMN site_id DROP NOT NULL;

-- Add a check constraint to require site_id when status is 'Present'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_site_present_check'
  ) THEN
    ALTER TABLE attendance
      ADD CONSTRAINT attendance_site_present_check
      CHECK (status <> 'Present' OR site_id IS NOT NULL);
  END IF;
END$$;


