# Admin Student Management - Course Count Fix

## Date: January 26, 2026

## Problem
The Admin Student Management page was showing incorrect course counts for students. The system was using the `course_purchase_count` field from the customers table, which could become outdated and didn't reflect the actual courses grouped from booking data.

## Solution
Updated `/api/admin/students/stats` endpoint (server/index.js line 3160) to use the actual course count from our course grouping logic instead of the database field.

### Change Made
```javascript
// BEFORE:
coursePurchaseCount: s.course_purchase_count || 1,

// AFTER:
coursePurchaseCount: courses.length || 0,
```

## Course Grouping Logic
The endpoint now uses the same logic as the course history system:

1. **Extract course identifiers** from `class_type` field (e.g., WT1701AM_DL6 from WT1701AM_DL6.1)
2. **Group bookings** by course identifier within each enrollment
3. **Apply makeup class detection**:
   - If all course identifiers have < 4 bookings each: keep together as one course with makeups
   - If any course identifier has 4+ bookings: split into separate courses

## Verified Counts

### Edith Lee (ID: 1225) ✅
- **Expected**: 4 courses
- **Actual**: 4 courses
- **Courses**:
  1. WT1701AM_DL6 (6 bookings, current)
  2. WT2308AM_DL6 (6 bookings, completed)
  3. WT1207AM_JL6 (6 bookings, completed)
  4. WT0410AM_JL6 (6 bookings, completed)

### Inge Bukit (ID: 1762) ✅
- **Expected**: 4 courses
- **Actual**: 4 courses
- **Courses**:
  1. WT1701AM_DL6 (6 bookings, current)
  2. WT0410AM_JL6 (6 bookings, completed)
  3. WT2308AM_DL6 (6 bookings, completed)
  4. WT1207AM_JL6 (6 bookings, completed)

### Jessie Ong (ID: 1240) ℹ️
- **Expected (per user note)**: 5 courses
- **Actual (based on booking data)**: 3 courses
- **Courses**:
  1. WT2301AM_JL6 (6 bookings, current)
  2. WT2208AM_JL6 (6 bookings, completed)
  3. WT2006AM_JL6 (6 bookings, completed)

**Note**: Jessie Ong currently has 3 courses based on actual booking data. The database field `course_purchase_count` also shows 3. If she should have 5 courses, additional course data needs to be added.

## Implementation Details

### Backend Changes
- **File**: `/Users/justinlong/pottery-gallery-app/server/index.js`
- **Lines**: 2830-2919 (course grouping logic), 3160 (course count response)
- **Logic**: Matches the course history endpoint (lines 1438-1517)

### Benefits
1. **Accuracy**: Course counts now reflect actual booking data
2. **Consistency**: Same logic used across course history and admin stats
3. **Automatic updates**: No need to manually update `course_purchase_count` field
4. **Proper handling**: Correctly groups courses and detects makeup classes

## Status
✅ **COMPLETE** - Backend updated and server restarted. Admin Student Management now shows accurate course counts based on actual booking data.

## Testing
Run `node verify-course-counts.js` to verify course counts for Edith, Inge, and Jessie.
