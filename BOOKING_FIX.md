# BOOKING FIX - Students Now Enrolled in All 6 Weeks

**Date Fixed**: Nov 15, 2025
**Issue**: Students were only booked into 1 class per course instead of all 6 weeks

## The Problem

When creating bookings from Shopify orders, students were only being enrolled in ONE class (usually week 6.6 - glazing) instead of all 6 weeks of their course.

**File**: `server/create_bookings_from_shopify_orders.js`
**Line**: ~203-210 (original)

### Bad Code (Before):
```javascript
// Find all 6 classes in this course (same time/instructor/day-of-week)
const courseClasses = allClasses.filter(cls => {
  const clsDate = new Date(cls.class_date);
  return cls.start_time === firstClass.start_time &&
         cls.instructor === firstClass.instructor &&
         cls.class_type === firstClass.class_type &&  // ❌ BUG: This is TOO SPECIFIC!
         clsDate.getDay() === firstClassDayOfWeek &&
         clsDate >= firstClassDate;
}).slice(0, 6);
```

### Why It Failed:
The `class_type` field contains the FULL identifier including the week number:
- Week 1: `WT1801AM_DL6.1`
- Week 2: `WT1801AM_DL6.2`
- Week 3: `WT1801AM_DL6.3`

So filtering by `cls.class_type === firstClass.class_type` would ONLY match classes with the EXACT same week number - resulting in finding only 1 class!

## The Fix

**File**: `server/create_bookings_from_shopify_orders.js`
**Line**: 202-214 (fixed)

```javascript
// Extract base course identifier (without week number)
// e.g., "WT1801AM_DL6.1" -> "WT1801AM_DL6"
const baseIdentifier = firstClass.class_type.substring(0, firstClass.class_type.lastIndexOf('.'));

// Find all 6 classes in this course (same base identifier)
const courseClasses = allClasses.filter(cls => {
  const clsDate = new Date(cls.class_date);
  const clsBaseIdentifier = cls.class_type.substring(0, cls.class_type.lastIndexOf('.'));

  return clsBaseIdentifier === baseIdentifier && // ✅ Match by base identifier!
         clsDate.getDay() === firstClassDayOfWeek && // Same day of week
         clsDate >= firstClassDate; // On or after first class
}).slice(0, 6);
```

### How It Works Now:
1. Extract base identifier: `WT1801AM_DL6.1` → `WT1801AM_DL6`
2. Match all classes with same base: `WT1801AM_DL6.1`, `WT1801AM_DL6.2`, ..., `WT1801AM_DL6.6`
3. Book student into ALL 6 weeks ✅

## Results

### Before Fix:
- 213 bookings total
- Most students only had 1 booking (usually week 6.6)
- Enrollment per week: Week .1 had students, weeks .2-.6 were empty

### After Fix:
- Students enrolled in ALL 6 weeks of their course
- Week .1, .2, .3, .4, .5, .6 all have matching enrollment
- Proper course attendance tracking

## How to Re-Sync

If bookings get messed up again:

```bash
cd server

# 1. Delete all bookings
node -e "require('dotenv').config(); const {supabase} = require('./utils/supabaseDb'); supabase.from('bookings').delete().neq('id', 0).then(() => console.log('✅ Deleted'));"

# 2. Re-create from Shopify (with fixed script)
node create_bookings_from_shopify_orders.js

# 3. Verify enrollment
node check_enrollment.js
```

## Calendar Display

With this fix, when viewing the class schedule:
- Students can see ALL 6 weeks of their course highlighted
- Enrollment counts are accurate across all weeks
- Reschedule feature can properly identify available weeks

## IMPORTANT

**DO NOT revert this change!** The base identifier matching is ESSENTIAL for multi-week course enrollment to work correctly.

Keep this file in the repository root as a permanent reminder!
