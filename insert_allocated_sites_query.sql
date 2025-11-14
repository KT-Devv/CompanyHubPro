-- Query to insert allocated sites for workers
-- This assigns workers to their allocated sites using names instead of UUIDs
-- Run this in your Supabase SQL Editor after updating workers with their allocated sites

-- Example 1: Assign a single worker to a site by name
-- UPDATE workers 
-- SET allocated_site_id = (SELECT id FROM sites WHERE site_name = 'Site A')
-- WHERE name = 'Worker Name Here';

-- Example 2: Assign multiple workers to the same site by name
-- UPDATE workers 
-- SET allocated_site_id = (SELECT id FROM sites WHERE site_name = 'Site A')
-- WHERE name IN ('Worker 1 Name', 'Worker 2 Name', 'Worker 3 Name');

-- Example 3: Assign all helpers to a specific site
-- UPDATE workers 
-- SET allocated_site_id = (SELECT id FROM sites WHERE site_name = 'Site A')
-- WHERE portfolio_id IN (
--   SELECT id FROM portfolios WHERE portfolio_name ILIKE 'helpers'
-- );

-- Example 4: Assign workers based on their current location or other criteria
-- UPDATE workers 
-- SET allocated_site_id = (SELECT id FROM sites WHERE site_name = 'Site A')
-- WHERE current_location ILIKE '%location-pattern%';

-- Example 5: Assign all workers of a specific portfolio to a site
-- UPDATE workers 
-- SET allocated_site_id = (SELECT id FROM sites WHERE site_name = 'Site B')
-- WHERE portfolio_id IN (
--   SELECT id FROM portfolios WHERE portfolio_name = 'Mason'
-- );

-- Example 6: Assign workers to different sites based on their names (pattern matching)
-- UPDATE workers 
-- SET allocated_site_id = (SELECT id FROM sites WHERE site_name = 'Site A')
-- WHERE name ILIKE '%pattern%';

-- To see current site assignments:
-- SELECT 
--   w.name,
--   w.worker_type,
--   p.portfolio_name,
--   s.site_name as allocated_site
-- FROM workers w
-- LEFT JOIN portfolios p ON w.portfolio_id = p.id
-- LEFT JOIN sites s ON w.allocated_site_id = s.id
-- ORDER BY s.site_name, w.name;

