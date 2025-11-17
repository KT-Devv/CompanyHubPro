# Implementation Guide: Site Model Changes

## What Changed?

### 1. **Single Site Model** 
Workers now have **ONE** site (`siteId`) instead of separate "allocated" and "current" sites.

### 2. **Supervisor Access Rules**
- **Primary Workers:** Supervisors see only workers assigned to their site
- **Visiting Workers:** Supervisors can search other sites and mark attendance for workers temporarily at their site
- **Attendance is Global:** Once marked, it prevents duplicate marking across all supervisors

### 3. **Cross-Site Worker Lookup**
New "Mark Other Worker" button for supervisors:
1. Click "Mark Other Worker"
2. Search by phone number or national ID
3. Select worker from results
4. Mark attendance (Present/Absent/Leave)
5. Automatically blocked if already marked for that date

---

## User Experience

### For Supervisors
```
Attendance Page
├── Main Workers List
│   └── Only shows workers assigned to their site
├── "Mark Other Worker" Button (NEW)
│   └── Opens modal to search other sites
│       ├── Search by phone or ID
│       └── Mark attendance for visitors
└── Prevents duplicates automatically
```

### For Secretaries
- Same experience as before
- See all office workers
- Mark attendance as usual

### For Management
- See all workers across all sites
- Manage worker assignments (site)
- View complete attendance records

---

## How Duplicate Prevention Works

The database schema now prevents duplicates:

```
Attendance Table (unique constraint on: worker_id + date)
├── worker_id: Foreign key to worker
├── date: Date of attendance
├── status: Present/Absent/Leave
├── marked_by: Which user marked it
└── (No site_id field needed)
```

Once a worker has attendance marked for a date:
- ✅ They're marked as "Already marked for this date"
- ✅ All buttons are disabled
- ✅ No supervisor can re-mark them
- ✅ Works across all sites automatically

---

## Database Changes

### Workers Table
```typescript
// OLD
allocatedSiteId: varchar("allocated_site_id")

// NEW  
siteId: varchar("site_id")
```

### Attendance Table
```typescript
// REMOVED
siteId: varchar("site_id") // No longer needed

// Site info comes from worker.siteId
```

---

## Migration SQL

Run this migration on your database:

```sql
-- Step 1: Rename column in workers table
ALTER TABLE workers 
RENAME COLUMN allocated_site_id TO site_id;

-- Step 2: Remove site_id from attendance table
ALTER TABLE attendance 
DROP COLUMN site_id;

-- Step 3: Verify (should show no site_id column in attendance)
\d attendance
```

---

## Code Changes Overview

| File | Changes | Why |
|------|---------|-----|
| `schema.ts` | Renamed `allocatedSiteId` → `siteId`, removed `siteId` from attendance | Simplify site model |
| `attendance.tsx` | Added cross-site lookup modal, simplified site display | Allow supervisor access to visiting workers |
| `workers-management.tsx` | Updated all references from `allocated_site` → `site` | Reflect schema changes |
| `attendance-management.tsx` | Updated site query path | Match new schema structure |

---

## Testing Checklist

### Basic Functionality
- [ ] Create a worker assigned to Site A
- [ ] Login as Supervisor for Site A
- [ ] Verify worker appears in their list
- [ ] Mark attendance for the worker
- [ ] Verify "Already marked" appears
- [ ] Verify buttons are disabled

### Cross-Site Lookup
- [ ] Create a worker assigned to Site B
- [ ] Login as Supervisor for Site A
- [ ] Click "Mark Other Worker"
- [ ] Search by phone number
- [ ] Search by national ID
- [ ] Mark attendance for Site B worker
- [ ] Verify attendance recorded
- [ ] Verify cannot re-mark

### Prevent Duplicates
- [ ] Have both supervisors attempt to mark same worker
- [ ] Verify second attempt shows "Already marked"
- [ ] Check database: only one record per (worker, date)

### Management View
- [ ] View all attendance records
- [ ] Filter by site
- [ ] Verify worker's site displays correctly
- [ ] No errors in console

---

## Troubleshooting

### Error: "Unknown column 'allocated_site_id'"
**Cause:** Migration not run  
**Solution:** Run the migration SQL above

### Error: "Column 'site_id' not found in attendance"
**Cause:** Old code trying to access removed column  
**Solution:** Verify all code updated (files listed above)

### Workers not appearing for supervisor
**Cause:** Worker's site doesn't match supervisor's site  
**Solution:** Check worker assignment in workers-management page

### Can mark attendance twice
**Cause:** Database constraint not applied  
**Solution:** Verify migration ran completely and no errors

---

## Performance Notes

- Site lookup now faster (single join instead of manual mapping)
- Attendance query simplified (no longer needs site resolution)
- Cross-site search uses `.or()` with phone/ID fields
- Recommend adding index on workers(phone_number, national_id)

```sql
CREATE INDEX idx_workers_phone_national_id ON workers(phone_number, national_id);
```

---

## Rollback Plan

If issues arise, reverse the changes:

```sql
-- Restore old schema
ALTER TABLE attendance 
ADD COLUMN site_id varchar;

ALTER TABLE workers 
RENAME COLUMN site_id TO allocated_site_id;

-- Revert code changes via git
git checkout [previous-commit]
```

---

## Questions?

Refer to the implementation in the modified files:
- `shared/schema.ts` - Type definitions
- `client/src/pages/attendance.tsx` - Cross-site lookup logic
- `CHANGES-SUMMARY.md` - Detailed technical changes
