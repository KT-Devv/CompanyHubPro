# 🧪 Comprehensive Test Scenarios

## Overview
This document provides detailed test scenarios for the single site model implementation with cross-site attendance marking.

---

## Test Environment Setup

### Prerequisites
- Test database with sample data
- Multiple supervisors assigned to different sites
- Workers assigned to various sites
- Test user accounts with appropriate roles

### Sample Data Structure
```
Sites:
- Site A (Main Site)
- Site B (Secondary Site)
- Site C (Small Site)

Workers at Site A:
- Worker A1 (Grounds - Carpenter)
- Worker A2 (Grounds - Helper)
- Worker A3 (Office - Manager)

Workers at Site B:
- Worker B1 (Grounds - Electrician)
- Worker B2 (Grounds - Helper)

Workers at Site C:
- Worker C1 (Grounds - Painter)

Users:
- Supervisor A (assigned to Site A)
- Supervisor B (assigned to Site B)
- Secretary (office)
- Manager (management)
```

---

## Test Suite 1: Worker Site Assignment

### TC-1.1: Create Worker with Site
**Objective:** Verify workers can be created with site assignment  
**Steps:**
1. Login as Manager/HR
2. Navigate to Workers Management
3. Click "Add Worker"
4. Fill form: Name, Type (Grounds), Portfolio, Site (select Site A)
5. Submit

**Expected Result:**
- ✅ Worker created successfully
- ✅ Site field shows "Site A"
- ✅ No "Allocated Site" or "Current Site" fields visible
- ✅ Worker appears in workers list
- ✅ No errors in console

### TC-1.2: Edit Worker Site Assignment
**Objective:** Verify workers can be reassigned to different sites  
**Steps:**
1. Login as Manager
2. Navigate to Workers Management
3. Select a worker (Worker A1)
4. Click Edit
5. Change Site from Site A to Site B
6. Save

**Expected Result:**
- ✅ Worker's site updated to Site B
- ✅ Confirmation message shown
- ✅ Worker list reflects new site
- ✅ Previous site attendance records remain intact

### TC-1.3: Worker Details View
**Objective:** Verify worker details show correct site information  
**Steps:**
1. Login as Manager
2. Go to Workers Management
3. Click "Eye" icon on any worker
4. Review details modal

**Expected Result:**
- ✅ Single "Site" field displayed (not allocated/current)
- ✅ Site name clearly shown
- ✅ All other worker info correct
- ✅ Modal displays cleanly

---

## Test Suite 2: Supervisor Site-Based Access

### TC-2.1: Supervisor Sees Only Their Site Workers
**Objective:** Verify supervisors only see workers from their assigned site  
**Steps:**
1. Login as Supervisor A (assigned to Site A)
2. Go to Mark Attendance page
3. Observe worker list

**Expected Result:**
- ✅ Only shows Worker A1, A2, A3 (Site A workers)
- ✅ Workers from Site B and C not visible
- ✅ Search still works on visible workers
- ✅ No "Mark Other Worker" button visible for non-supervisors

### TC-2.2: Supervisor B Cannot See Supervisor A's Workers
**Objective:** Verify access control between supervisors  
**Steps:**
1. Login as Supervisor A → see Site A workers
2. Logout
3. Login as Supervisor B → see Site B workers
4. Logout
5. Login as Secretary → see all office workers

**Expected Result:**
- ✅ Each supervisor sees only their site
- ✅ No cross-contamination
- ✅ Secretary sees office workers regardless of site
- ✅ All transitions work smoothly

### TC-2.3: Management Sees All Workers
**Objective:** Verify management has full visibility  
**Steps:**
1. Login as Manager
2. Go to Workers Management
3. Observe worker list

**Expected Result:**
- ✅ Shows all workers from all sites
- ✅ Site column populated for all workers
- ✅ Can filter by site if needed
- ✅ Can edit any worker

---

## Test Suite 3: Attendance Marking - Primary Workers

### TC-3.1: Mark Regular Attendance
**Objective:** Verify normal attendance marking workflow  
**Steps:**
1. Login as Supervisor A
2. Go to Mark Attendance
3. Click "Present" for Worker A1
4. Wait for confirmation

**Expected Result:**
- ✅ Toast notification: "Attendance recorded"
- ✅ Worker shows "Already marked for this date"
- ✅ All buttons disabled for that worker
- ✅ No errors in console

### TC-3.2: Mark Absent
**Objective:** Verify absence recording  
**Steps:**
1. Login as Supervisor A
2. Go to Mark Attendance
3. Click "Absent" for Worker A2

**Expected Result:**
- ✅ Recorded as Absent
- ✅ Status appears in attendance records
- ✅ Cannot re-mark

### TC-3.3: Mark Leave
**Objective:** Verify leave recording  
**Steps:**
1. Login as Supervisor A
2. Go to Mark Attendance
3. Click "Leave" for Worker A3

**Expected Result:**
- ✅ Recorded as Leave
- ✅ All three statuses now available
- ✅ Cannot change once marked

### TC-3.4: Change Date and Mark Again
**Objective:** Verify can mark same worker on different dates  
**Steps:**
1. Login as Supervisor A
2. Mark Worker A1 as Present for today
3. Change date to tomorrow
4. Mark Worker A1 as Present for tomorrow

**Expected Result:**
- ✅ Both records created
- ✅ Each date has separate entry
- ✅ No conflicts

---

## Test Suite 4: Cross-Site Attendance (NEW FEATURE)

### TC-4.1: Supervisor Accesses Cross-Site Modal
**Objective:** Verify cross-site feature is available to supervisors  
**Steps:**
1. Login as Supervisor A
2. Go to Mark Attendance
3. Observe header area

**Expected Result:**
- ✅ "Mark Other Worker" button visible (bottom right of date picker)
- ✅ Non-supervisors don't see this button
- ✅ Click opens modal dialog

### TC-4.2: Search Worker by Phone Number
**Objective:** Verify phone number search works  
**Steps:**
1. Login as Supervisor A
2. Click "Mark Other Worker"
3. Enter Worker B1's phone number (e.g., "0244123456")
4. Click Search

**Expected Result:**
- ✅ Worker B1 appears in results
- ✅ Shows name, phone, site (Site B)
- ✅ Worker from Site A doesn't appear
- ✅ Results are from other sites only

### TC-4.3: Search Worker by National ID
**Objective:** Verify national ID search works  
**Steps:**
1. Login as Supervisor A
2. Click "Mark Other Worker"
3. Enter Worker B1's national ID
4. Click Search

**Expected Result:**
- ✅ Worker B1 appears
- ✅ Same result as phone search
- ✅ Case-insensitive matching works

### TC-4.4: Search Returns No Results
**Objective:** Verify error handling for no results  
**Steps:**
1. Login as Supervisor A
2. Click "Mark Other Worker"
3. Enter non-existent phone: "9999999999"
4. Click Search

**Expected Result:**
- ✅ Toast: "No workers found..."
- ✅ No results displayed
- ✅ Modal stays open
- ✅ Can try again

### TC-4.5: Mark Visiting Worker Present
**Objective:** Verify can mark attending worker  
**Steps:**
1. Login as Supervisor A
2. Click "Mark Other Worker"
3. Search for Worker B1
4. Click "Present" button in results

**Expected Result:**
- ✅ Attendance recorded
- ✅ Toast: "Attendance recorded"
- ✅ Modal closes automatically
- ✅ Search field cleared
- ✅ Returns to main attendance page

### TC-4.6: Mark Visiting Worker Absent
**Objective:** Verify absence for visiting workers  
**Steps:**
1. Login as Supervisor A
2. Click "Mark Other Worker"
3. Search for Worker C1
4. Click "Absent"

**Expected Result:**
- ✅ Recorded as Absent
- ✅ Modal closes
- ✅ Can open modal again and verify already marked

### TC-4.7: Already Marked Worker Shows Disabled
**Objective:** Verify duplicate prevention in modal  
**Steps:**
1. Mark Worker B1 Present from Supervisor A
2. Click "Mark Other Worker" again
3. Search for Worker B1

**Expected Result:**
- ✅ Worker B1 appears in results
- ✅ Shows "Already marked for this date"
- ✅ All three buttons are disabled
- ✅ Cannot re-mark

---

## Test Suite 5: Duplicate Prevention

### TC-5.1: Cannot Mark Twice by Same Supervisor
**Objective:** Verify duplicate prevention at UI level  
**Steps:**
1. Login as Supervisor A
2. Mark Worker A1 as Present
3. Attempt to click "Present" again

**Expected Result:**
- ✅ Button is disabled
- ✅ Status shows "Already marked for this date"
- ✅ Cannot click

### TC-5.2: Cannot Mark by Different Supervisor
**Objective:** Verify cross-supervisor duplicate prevention  
**Steps:**
1. Supervisor A marks Worker B1 Present (cross-site)
2. Supervisor B attempts to mark Worker B1

**Expected Result:**
- ✅ Worker B1 shows "Already marked for this date"
- ✅ Buttons disabled
- ✅ Database shows only 1 record
- ✅ Cannot re-mark from any supervisor

### TC-5.3: Database Constraint Prevents Duplicates
**Objective:** Verify database-level duplicate prevention  
**Steps:**
1. Mark Worker A1 Present
2. Check database directly for (worker_id, date) uniqueness
3. Attempt direct insert of duplicate

**Expected Result:**
- ✅ Only one record in database
- ✅ Direct database insert fails
- ✅ Constraint error returned
- ✅ Data integrity maintained

### TC-5.4: Can Mark Again Next Day
**Objective:** Verify daily independence  
**Steps:**
1. Mark Worker A1 Present for today
2. Change date to tomorrow
3. Mark Worker A1 Present for tomorrow

**Expected Result:**
- ✅ Both records exist
- ✅ No conflicts between dates
- ✅ Each date independent

---

## Test Suite 6: Secretary Workflow

### TC-6.1: Secretary Sees Office Workers Only
**Objective:** Verify secretary access control  
**Steps:**
1. Login as Secretary
2. Go to Mark Attendance

**Expected Result:**
- ✅ Only office workers visible
- ✅ All grounds workers hidden
- ✅ No "Mark Other Worker" button
- ✅ Otherwise same workflow

### TC-6.2: Secretary Cannot Access Cross-Site
**Objective:** Verify secretaries don't have cross-site access  
**Steps:**
1. Login as Secretary
2. Look for "Mark Other Worker" button

**Expected Result:**
- ✅ Button not visible
- ✅ No cross-site feature
- ✅ Intended behavior maintained

---

## Test Suite 7: Management & Reporting

### TC-7.1: Management View All Attendance
**Objective:** Verify management sees complete records  
**Steps:**
1. Login as Manager
2. Go to Attendance Management
3. Select a date with various marked attendances

**Expected Result:**
- ✅ Shows all records for that date
- ✅ Shows worker name, site, type, status
- ✅ Site column shows worker's assigned site
- ✅ Can filter by site
- ✅ Can filter by worker type
- ✅ Can filter by status

### TC-7.2: Filter by Site
**Objective:** Verify filtering in management view  
**Steps:**
1. Login as Manager
2. Go to Attendance Management
3. Filter by Site A

**Expected Result:**
- ✅ Shows only workers from Site A
- ✅ All their attendance records visible
- ✅ Other sites excluded

### TC-7.3: View Attendance Statistics
**Objective:** Verify stats cards  
**Steps:**
1. Login as Manager
2. Go to Attendance Management
3. Observe stats cards at top

**Expected Result:**
- ✅ Total count correct
- ✅ Present count correct
- ✅ Absent count correct
- ✅ Leave count correct
- ✅ Matches table data

---

## Test Suite 8: Edge Cases & Error Handling

### TC-8.1: Search with Special Characters
**Objective:** Verify search robustness  
**Steps:**
1. Login as Supervisor A
2. Click "Mark Other Worker"
3. Enter search with special chars: "0244/123#456"

**Expected Result:**
- ✅ Handled gracefully
- ✅ No crashes
- ✅ Returns no results or matches appropriately
- ✅ Error message if needed

### TC-8.2: Empty Search
**Objective:** Verify empty search handling  
**Steps:**
1. Click "Mark Other Worker"
2. Leave search empty
3. Click Search

**Expected Result:**
- ✅ Toast: "Enter search query"
- ✅ No API call made
- ✅ No crash

### TC-8.3: Network Error During Search
**Objective:** Verify error resilience  
**Steps:**
1. Disable network (dev tools)
2. Click "Mark Other Worker"
3. Try to search

**Expected Result:**
- ✅ Toast shows error
- ✅ User informed of issue
- ✅ Can retry when network restored

### TC-8.4: Worker with Missing Data
**Objective:** Verify handling of incomplete records  
**Steps:**
1. Search for worker missing phone/ID
2. Attempt to mark attendance

**Expected Result:**
- ✅ Still appears if matches
- ✅ Can still mark attendance
- ✅ All operations work

### TC-8.5: Null/Empty Site Assignment
**Objective:** Verify workers must have site  
**Steps:**
1. Try to create worker without site
2. Try to assign null site

**Expected Result:**
- ✅ Form validation prevents it
- ✅ Database constraint prevents it
- ✅ Error message shown
- ✅ Data integrity maintained

---

## Test Suite 9: Performance Tests

### TC-9.1: Large Attendance List
**Objective:** Verify performance with many records  
**Steps:**
1. Create 100+ attendance records
2. Load Attendance Management page
3. Apply filters
4. Search workers

**Expected Result:**
- ✅ Page loads in <2 seconds
- ✅ Filters apply quickly
- ✅ No lag or freezing
- ✅ Smooth scrolling

### TC-9.2: Many Workers in Site
**Objective:** Verify supervisor list performance  
**Steps:**
1. Assign 50+ workers to one site
2. Login as that supervisor
3. Load Mark Attendance page

**Expected Result:**
- ✅ List loads in <2 seconds
- ✅ Search still responsive
- ✅ Can mark attendance smoothly

### TC-9.3: Cross-Site Search Performance
**Objective:** Verify search performance  
**Steps:**
1. Have 1000+ workers in database
2. Search for worker by phone

**Expected Result:**
- ✅ Results in <1 second
- ✅ Index working properly
- ✅ No N+1 queries

---

## Test Suite 10: Data Integrity

### TC-10.1: Verify Historical Data Preserved
**Objective:** Verify old attendance records intact  
**Steps:**
1. Check attendance records before migration
2. Run migration
3. Check records after migration

**Expected Result:**
- ✅ All records preserved
- ✅ No data loss
- ✅ Dates intact
- ✅ Statuses correct

### TC-10.2: Verify Worker Site Assignment
**Objective:** Verify all workers have sites  
**Steps:**
1. Run migration
2. Query: `SELECT COUNT(*) FROM workers WHERE site_id IS NULL`

**Expected Result:**
- ✅ Returns 0
- ✅ All workers assigned sites
- ✅ No null values

### TC-10.3: Verify No Duplicate Attendance
**Objective:** Verify constraint applied correctly  
**Steps:**
1. Run migration
2. Query for duplicates using provided view

**Expected Result:**
- ✅ No duplicates found
- ✅ Constraint active
- ✅ Ready to prevent future duplicates

---

## Regression Test Suite

### RT-1: Worker CRUD Operations
- [ ] Create new worker
- [ ] Read worker details
- [ ] Update worker info
- [ ] Delete worker

### RT-2: Attendance Workflows
- [ ] Mark present
- [ ] Mark absent
- [ ] Mark leave
- [ ] Change date

### RT-3: Site Management
- [ ] Create site
- [ ] Edit site name
- [ ] View site details
- [ ] Filter by site

### RT-4: User Roles
- [ ] Owner access
- [ ] HR access
- [ ] Manager access
- [ ] Supervisor access
- [ ] Secretary access

### RT-5: Authentication
- [ ] Login success
- [ ] Login failure
- [ ] Session timeout
- [ ] Token refresh

---

## Stress Test Scenarios

### ST-1: High Concurrent Users
- 10 supervisors marking attendance simultaneously
- Expect: No conflicts, all records created

### ST-2: Rapid Attendance Marking
- Mark 100 workers in quick succession
- Expect: All recorded, no duplicates

### ST-3: Large Data Exports
- Export 1000+ attendance records
- Expect: No timeout, data complete

---

## Browser Compatibility Tests

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome
- [ ] Mobile Safari

---

## Accessibility Tests

- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Color contrast
- [ ] Form labels
- [ ] Error messages

---

## Test Result Template

```
Test Case: [TC-X.X]
Title: [Title]
Status: [ ] PASS [ ] FAIL [ ] SKIP
Date: YYYY-MM-DD
Tester: [Name]
Notes: [Any observations]
```

---

## Conclusion

This comprehensive test suite ensures:
- ✅ All features work correctly
- ✅ Data integrity maintained
- ✅ Performance acceptable
- ✅ Edge cases handled
- ✅ No regressions
- ✅ User experience smooth

Run all tests before production deployment.
