-- Migration: Single Site Model for Workers
-- Date: 2025-11-17
-- Purpose: Simplify site assignment from allocated/current to single site
-- Backward Compatible: No (requires code updates)

-- ============================================================================
-- PHASE 1: DATA MIGRATION
-- ============================================================================

-- Step 1: Create new site_id column in workers table (uuid type to match sites.id)
ALTER TABLE workers 
ADD COLUMN site_id_new uuid;

-- Step 2: Copy data from allocated_site_id to new site_id column (cast varchar to uuid)
UPDATE workers 
SET site_id_new = allocated_site_id::uuid 
WHERE allocated_site_id IS NOT NULL;

-- Step 3: Add foreign key constraint to new column
ALTER TABLE workers 
ADD CONSTRAINT fk_workers_site_id_new 
FOREIGN KEY (site_id_new) 
REFERENCES sites(id) ON DELETE RESTRICT;

-- Step 4: Drop old allocated_site_id column
ALTER TABLE workers 
DROP COLUMN allocated_site_id;

-- Step 5: Rename new column to site_id
ALTER TABLE workers 
RENAME COLUMN site_id_new TO site_id;

-- Step 6: Remove site_id from attendance table (if it exists)
ALTER TABLE attendance 
DROP COLUMN IF EXISTS site_id;

-- ============================================================================
-- PHASE 2: INDEXES & PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Create index on workers(site_id) for supervisor queries
CREATE INDEX IF NOT EXISTS idx_workers_site_id 
ON workers(site_id);

-- Create index on workers(phone_number, national_id) for cross-site lookup
CREATE INDEX IF NOT EXISTS idx_workers_phone_national_id 
ON workers(phone_number, national_id) 
WHERE phone_number IS NOT NULL AND national_id IS NOT NULL;

-- Create index on attendance(worker_id, date) for duplicate prevention & lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_worker_date 
ON attendance(worker_id, date);

-- Create index on attendance(marked_by, date) for supervisor's attendance records
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by_date 
ON attendance(marked_by, date);

-- Create composite index for attendance queries with filters
CREATE INDEX IF NOT EXISTS idx_attendance_date_status 
ON attendance(date, status);

-- ============================================================================
-- PHASE 3: CONSTRAINTS & DATA INTEGRITY
-- ============================================================================

-- Ensure site_id is not null for workers
ALTER TABLE workers 
ADD CONSTRAINT check_workers_site_id_not_null 
CHECK (site_id IS NOT NULL);

-- Ensure worker_type is valid
ALTER TABLE workers 
ADD CONSTRAINT check_worker_type_valid 
CHECK (worker_type IN ('office', 'grounds'));

-- Ensure attendance status is valid
ALTER TABLE attendance 
ADD CONSTRAINT check_attendance_status_valid 
CHECK (status IN ('Present', 'Absent', 'Leave'));

-- ============================================================================
-- PHASE 4: VERIFICATION & ROLLBACK HELPERS
-- ============================================================================

-- View for checking workers with missing sites
CREATE OR REPLACE VIEW v_workers_without_site AS
SELECT id, name, worker_type, phone_number
FROM workers
WHERE site_id IS NULL;

-- View for checking duplicate attendance
CREATE OR REPLACE VIEW v_duplicate_attendance AS
SELECT worker_id, date, COUNT(*) as count
FROM attendance
GROUP BY worker_id, date
HAVING COUNT(*) > 1;

-- View for attendance summary by site
CREATE OR REPLACE VIEW v_attendance_summary_by_site AS
SELECT 
  s.site_name,
  a.date,
  a.status,
  COUNT(a.id) as count
FROM attendance a
LEFT JOIN workers w ON a.worker_id = w.id
LEFT JOIN sites s ON w.site_id = s.id
GROUP BY s.site_name, a.date, a.status
ORDER BY s.site_name, a.date DESC, a.status;

-- ============================================================================
-- PHASE 5: DATA VALIDATION & VERIFICATION
-- ============================================================================

-- Verify migration success
DO $$
DECLARE
  workers_without_site INT;
  duplicate_attendance INT;
BEGIN
  -- Check for workers without site
  SELECT COUNT(*) INTO workers_without_site 
  FROM v_workers_without_site;
  
  -- Check for duplicate attendance
  SELECT COUNT(*) INTO duplicate_attendance 
  FROM v_duplicate_attendance;
  
  IF workers_without_site > 0 THEN
    RAISE WARNING 'Warning: % workers have no site assigned', workers_without_site;
  ELSE
    RAISE NOTICE '✓ All workers have sites assigned';
  END IF;
  
  IF duplicate_attendance > 0 THEN
    RAISE WARNING 'Warning: % duplicate attendance records found', duplicate_attendance;
  ELSE
    RAISE NOTICE '✓ No duplicate attendance records';
  END IF;
  
  RAISE NOTICE '✓ Migration completed successfully';
END $$;

-- ============================================================================
-- FINAL VERIFICATION QUERIES
-- ============================================================================

-- Query 1: Verify workers table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'workers' 
  AND column_name IN ('site_id', 'allocated_site_id')
ORDER BY column_name;

-- Query 2: Verify attendance table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'attendance' 
  AND column_name IN ('site_id', 'worker_id', 'date')
ORDER BY column_name;

-- Query 3: Check index creation
SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE tablename IN ('workers', 'attendance')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Query 4: Count workers by site (for validation)
SELECT 
  s.site_name,
  COUNT(w.id) as worker_count
FROM sites s
LEFT JOIN workers w ON s.id = w.site_id
GROUP BY s.site_name
ORDER BY s.site_name;

-- Query 5: Recent attendance summary
SELECT 
  date,
  status,
  COUNT(*) as count
FROM attendance
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date, status
ORDER BY date DESC, status;
