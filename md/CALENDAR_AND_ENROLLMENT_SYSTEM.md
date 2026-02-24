# Calendar and Enrollment System Documentation

## Overview
This document describes the shared calendar system used across the pottery gallery application and the enrollment counting implementation.

**Last Updated:** 2025-11-15

---

## Calendar Component Architecture

### Shared Calendar Component
Both admin and public/student views use the **same calendar component**: `ClassCalendar`

**Component Location:** `/frontend/src/components/ClassCalendar.jsx`

### Pages Using the Calendar

#### 1. Student/Public Classes Page (`/classes`)
- **File:** `/frontend/src/pages/ClassScheduleNew.jsx`
- **Route:** `/classes`
- **Calendar Props:**
  - `isAdminView={false}` (line 724)
  - Shows student-facing features (enrollment, rescheduling, waitlist)
  - Hides capacity numbers from students
  - Allows course booking and enrollment

#### 2. Admin Classes Page (`/admin/classes`)
- **File:** `/frontend/src/pages/AdminClasses.jsx`
- **Route:** `/admin/classes`
- **Calendar Props:**
  - `isAdminView={true}` (line 410)
  - Shows admin-facing features (member lists, enrollment counts)
  - Displays enrollment as "X/8 enrolled"
  - Allows admin to reschedule students

### Shared Calendar Features

Both pages share:
- **Same calendar rendering logic**
- **Same date selection behavior**
- **Same course highlighting system** (light orange for 6-week courses)
- **Same class filtering** (by class type: wheelthrowing beginner, intermediate, handbuilding, etc.)
- **Same course date grouping** logic
- **Same API endpoint** for fetching data: `/api/admin/classes`

---

## Data Flow

```
┌─────────────────────────────────────┐
│  Backend: /api/admin/classes        │
│  (server/index.js lines 1991-2089)  │
└──────────────┬──────────────────────┘
               │
               │ Fetches courses with pagination
               │ (1143 bookings across 2 pages)
               │
        ┌──────▼──────┐
        │   Courses   │
        │   + Classes │
        │   + Bookings│
        └──────┬──────┘
               │
       ────────┴────────
      │                 │
┌─────▼─────┐    ┌─────▼─────┐
│ /classes  │    │ /admin/   │
│           │    │ classes   │
│ Student   │    │ Admin     │
│ View      │    │ View      │
└─────┬─────┘    └─────┬─────┘
      │                │
      └────────┬───────┘
               │
        ┌──────▼──────────┐
        │  ClassCalendar  │
        │   Component     │
        └─────────────────┘
```

---

## Enrollment Counting System

### The Problem (Fixed 2025-11-15)

**Issue:** Enrollment counts were showing incorrectly (e.g., "1/8" when actually "7/8")

**Root Cause:**
1. Supabase JavaScript client has a **default limit of 1000 rows**
2. Database had **1143 total bookings**
3. Backend was only fetching the first 1000 bookings
4. Missing 143 bookings caused incorrect unique student counts

### The Solution

**File:** `server/index.js` (lines 2047-2071)

Implemented **pagination** to fetch ALL bookings:

```javascript
// Get booking counts for each class AND unique students per course
// IMPORTANT: Fetch ALL bookings using pagination (default limit is 1000)
let bookingCounts = [];
let page = 0;
const pageSize = 1000;
let hasMore = true;

while (hasMore) {
  const { data, error } = await supabaseDb.supabase
    .from('bookings')
    .select('class_instance_id, student_id, status')
    .in('status', ['booked', 'completed'])
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) {
    console.error('❌ Error fetching bookings:', error);
    throw error;
  }

  bookingCounts = bookingCounts.concat(data);
  hasMore = data.length === pageSize;
  page++;
}

console.log(`✅ Fetched ${bookingCounts.length} bookings`);
```

### Enrollment Calculation Logic

**File:** `server/index.js` (lines 2068-2080)

```javascript
// Add booking counts to classes and calculate UNIQUE students per course
courses.forEach(course => {
  // Count unique students across all weeks of this course
  const uniqueStudents = new Set();
  course.classes.forEach(cls => {
    cls.bookingCount = bookingCountsByClass[cls.id] || 0;
    // Add all students from this class to the set
    bookingCounts
      .filter(b => b.class_instance_id === cls.id)
      .forEach(b => uniqueStudents.add(b.student_id));
  });
  course.totalEnrollment = uniqueStudents.size; // Count of unique students
});
```

### Why Use a Set?

**Problem:** A 6-week course with 7 students creates 42 bookings (7 × 6)

**Solution:** Use JavaScript `Set` to count **unique** `student_id` values
- Set automatically deduplicates
- `uniqueStudents.size` gives the actual number of enrolled students
- Result: Correctly shows "7/8 enrolled" instead of "42/8 enrolled"

---

## Course Highlighting System

### CRITICAL: Default Light Orange Highlights (Updated 2025-11-15)

**🔒 SOURCE OF TRUTH - DO NOT CHANGE WITHOUT UPDATING THIS SECTION**

ALL wheelthrowing classes (weeks 6.1-6.5) are highlighted in **light orange by default** on the calendar.

**Visual Behavior:**
1. **Default State:** ALL wheelthrowing classes show with light orange background (`bg-orange-500/20`)
2. **Glazing Week:** Week 6.6 (glazing classes) show with light brown background (`bg-amber-800/30`)
3. **Clicked Course:** When clicking a course, all 6 weeks turn dark orange (`bg-accent text-white`)

**Implementation Details:**

#### File: `frontend/src/components/ClassCalendar.jsx` (Lines 103-123)

```javascript
// Show light orange for all wheelthrowing classes EXCEPT glazing week (.6)
// If this day has glazing classes, skip the orange background
if (!hasGlazingClass) {
  if (classTypeFilter === 'all' && dayClasses.length > 0) {
    const classCategories = [...new Set(dayClasses.map(c => getClassCategory(c.class_type)))];
    const config = classTypeConfig[classCategories[0]];
    if (config) {
      bgColorClass = config.bgLight; // NO isSelected check - always apply
    }
  } else if (classTypeFilter !== 'all') {
    const config = classTypeConfig[classTypeFilter];
    if (config) {
      bgColorClass = config.bgLight; // NO isSelected check - always apply
    }
  }
}

// Special background for glazing classes (brown for week 6)
if (hasGlazingClass && !isEnrolledDay) {
  bgColorClass = 'bg-amber-800/30'; // NO isSelected check - always apply
}
```

**CRITICAL:** Lines 110, 115, and 122 do NOT check `isSelected` - they apply the background color unconditionally.

#### File: `frontend/src/pages/AdminClasses.jsx` (Lines 60-76)

```javascript
const getClassCategory = (classType) => {
  if (!classType) return 'other';
  const upper = classType.toUpperCase();

  // Check for course identifier prefixes (WT, HB, KD)
  if (upper.startsWith('WT')) return 'wheelthrowing-beginner'; // Default all wheelthrowing to beginner
  if (upper.startsWith('HB')) return 'handbuilding';
  if (upper.startsWith('KD')) return 'kids';

  // Fallback to word matching
  const lower = classType.toLowerCase();
  if (lower.includes('wheelthrowing') && lower.includes('beginner')) return 'wheelthrowing-beginner';
  if (lower.includes('wheelthrowing') && lower.includes('intermediate')) return 'wheelthrowing-intermediate';
  if (lower.includes('handbuilding')) return 'handbuilding';
  if (lower.includes('kids') || lower.includes('children')) return 'kids';
  return 'other';
};
```

**CRITICAL:** Line 65 checks for `WT` prefix (not the word "wheelthrowing") because database stores class_type as "WT1210AM_DL6.4" format.

### Course Selection Highlighting

When a user clicks on a course date, all 6 weeks of that course are highlighted in **dark orange**.

**Implementation:**
1. User clicks a date with classes
2. System identifies if there are week-based courses (courses with week numbers like `.1`, `.2`, etc.)
3. If multiple courses on same date, shows dropdown menu to select which course to highlight
4. Once course selected, `setHighlightedCourseDates()` is called with array of all dates in that course
5. Calendar component applies dark orange styling to those dates

**Shared Logic:**
- Both `/classes` and `/admin/classes` use `getCourseDates()` function
- Both highlight courses the same way
- Both show course selection menu when multiple courses on same date

---

## Course Identifier System

### Base Identifier Format
Format: `WT1801AM_DL6`

Components:
- `WT` = Wheelthrowing (or `HB` for Handbuilding)
- `1801` = Date code (18th of January in DDMM format)
- `AM` = Time slot (AM=9:30-12pm, PM=1-3:30pm, NT=7-9:30pm)
- `DL` = Instructor code (DL=Dillon Lin, JL=Joyce Lim, LT=Lynette Ting)
- `6` = Course length in weeks

### Full Identifier Format
Format: `WT1801AM_DL6.1`

Same as base, plus:
- `.1` = Week number (1-6 for 6-week courses, 1-4 for 4-week handbuilding)

### Usage

**Base Identifier (`identifier`):**
- Groups all weeks of a course together
- Used for calculating total course enrollment
- Used for finding all classes in the same course

**Full Identifier (`class_type` or `fullCourseIdentifier`):**
- Identifies a specific week of a course
- Used for displaying class details
- Used for matching specific classes

---

## Class Type Filtering

### Available Filters

Both pages support filtering by:
1. **All Classes** - Shows everything
2. **Wheelthrowing Beginner** - Orange border/highlight
3. **Wheelthrowing Intermediate** - Cyan border/highlight
4. **Handbuilding** - Black border/highlight
5. **Kids Classes** - Yellow border/highlight

### Filter Configuration

Defined in `classTypeConfig` object in both pages:

```javascript
const classTypeConfig = {
  'wheelthrowing-beginner': {
    label: 'Wheelthrowing Beginner',
    bgActive: 'bg-orange-500',
    border: 'border-orange-500',
    text: 'text-orange-700',
    bgLight: 'bg-orange-500/20'
  },
  // ... other configs
};
```

---

## Database Schema

### Bookings Table

Key fields used in enrollment counting:
- `student_id` - UUID of the student (used for unique counting)
- `class_instance_id` - UUID of the class instance
- `status` - 'booked', 'completed', 'cancelled', 'rescheduled'

**Important:** Only bookings with status `'booked'` or `'completed'` are counted toward enrollment.

### Class Instances Table

Key fields:
- `id` - UUID
- `class_date` - Date in YYYY-MM-DD format
- `class_type` - Full identifier (e.g., "WT1801AM_DL6.1")
- `start_time` - Time in "H:MM AM/PM" format
- `end_time` - Time in "H:MM AM/PM" format
- `instructor` - Instructor name
- `room` - Studio location
- `max_capacity` - Maximum students (8 for wheelthrowing, 10 for handbuilding, 14 for glazing)

---

## Key Behavioral Rules

### 1. Pagination is Critical
- Always use pagination when fetching bookings
- Default Supabase limit is 1000 rows
- Current system has 1143+ bookings
- Will grow over time, so pagination must remain

### 2. Unique Student Counting
- Use `Set` to count unique `student_id` values
- Never sum `bookingCount` across weeks
- Each student enrolled in a 6-week course = 6 bookings but counts as 1 enrollment

### 3. Both Pages Use Same Data
- Both `/classes` and `/admin/classes` call `/api/admin/classes`
- Same course data, same enrollment counts
- Difference is in display and features, not data

### 4. Course Highlighting
- Light orange for 6-week courses
- Shows all 6 weeks when any week is clicked
- Multiple courses on same date → dropdown menu to select which to highlight

---

## Testing Enrollment Counts

To verify enrollment counts are correct:

1. Run the enrollment checker:
```bash
node /Users/justinlong/pottery-gallery-app/server/check_all_enrollment.js
```

2. Check backend logs for:
```
✅ Fetched 1143 bookings
```
(Should show total number of bookings, not 1000)

3. Verify course enrollment display:
- WT2009PM_DL6 (Sept 20 Saturday 1:00pm) should show **7/8 enrolled**
- WT0203AM_DL6 (March 2 Sunday 9:30am) should show **8/8 enrolled**

---

## Common Issues and Solutions

### Issue: "Fetched 1000 bookings" in logs
**Solution:** Pagination not working. Check `server/index.js` lines 2047-2071 for while loop implementation.

### Issue: Wrong enrollment count (too high)
**Solution:** Check if using `Set` for unique student counting. Should be `uniqueStudents.size`, not sum of `bookingCount`.

### Issue: Calendar not highlighting all weeks
**Solution:** Check `getCourseDates()` function. Should match on `baseCourseIdentifier`, not `fullCourseIdentifier`.

### Issue: Different counts on /classes vs /admin/classes
**Solution:** Both should use same endpoint. Verify both are calling `/api/admin/classes`.

### Issue: Classes not showing light orange highlights by default
**Symptoms:** Calendar dates only show orange when clicked, not by default.

**Root Cause:** One of two problems:
1. `getClassCategory()` is returning "other" instead of "wheelthrowing-beginner"
2. `bgColorClass` is being cleared when `isSelected === true`

**Solution:**
1. Check `getClassCategory()` function in AdminClasses.jsx (line 60-76):
   - Must check `classType.toUpperCase().startsWith('WT')` for wheelthrowing
   - Database stores class_type as "WT1210AM_DL6.4", NOT "Wheelthrowing Beginner Week 4"
2. Check ClassCalendar.jsx highlighting logic (lines 103-123):
   - Lines 110, 115, 122 should NOT have `isSelected ? '' : config.bgLight`
   - Should be just `config.bgLight` (unconditional application)

**Debug Steps:**
1. Open browser console (F12)
2. Check for logs showing "Category: other Config: undefined"
3. If seeing this, the `getClassCategory()` function is broken
4. Verify it checks for `WT` prefix, not word "wheelthrowing"

---

## Future Considerations

1. **Scaling:** As bookings grow beyond 10,000, consider:
   - Indexed queries on `student_id` and `class_instance_id`
   - Caching enrollment counts in class_instances table
   - Server-side aggregation instead of fetching all bookings

2. **Real-time Updates:** Consider WebSocket or polling for live enrollment updates

3. **Performance:** May need to optimize pagination if fetching becomes slow:
   - Current: Fetch all bookings every request
   - Improvement: Cache bookings with TTL, invalidate on booking changes

4. **Capacity Rules:**
   - Wheelthrowing: 8 students max
   - Handbuilding: 10 students max
   - Glazing (Week 6): 14 students max
   - These are hardcoded - consider making configurable

---

## Related Files

### Backend
- `server/index.js` (lines 1991-2089) - Main API endpoint with pagination
- `server/check_all_enrollment.js` - Enrollment verification script
- `server/create_bookings_from_shopify_orders.js` - Creates bookings from Shopify
- `server/utils/courseScheduler.js` - Course date generation logic

### Frontend
- `frontend/src/components/ClassCalendar.jsx` - Shared calendar component
- `frontend/src/pages/ClassScheduleNew.jsx` - Student view (/classes)
- `frontend/src/pages/AdminClasses.jsx` - Admin view (/admin/classes)
- `frontend/src/App.jsx` - Route definitions

### Documentation
- `CLASS_SCHEDULE_RULES.md` - Business rules for class scheduling
- `CALENDAR_AND_ENROLLMENT_SYSTEM.md` - This file

---

## Summary

**Key Points:**
1. ✅ Both `/classes` and `/admin/classes` use the **same** `ClassCalendar` component
2. ✅ Enrollment counting uses **pagination** to fetch all 1143+ bookings
3. ✅ Uses **Set** to count unique students (prevents double-counting across weeks)
4. ✅ **ALL wheelthrowing classes (6.1-6.5) are highlighted in light orange BY DEFAULT**
5. ✅ Glazing classes (week 6.6) are highlighted in light brown BY DEFAULT
6. ✅ Clicking a course highlights all 6 weeks in dark orange
7. ✅ Both pages share the same data source: `/api/admin/classes`

**Critical Implementation Details:**
- Pagination is **mandatory** (Supabase default limit is 1000 rows)
- Must use `Set` for unique student counting
- Base identifier groups course weeks together
- Calendar component is shared but renders differently based on `isAdminView` prop
- **`getClassCategory()` MUST check for "WT" prefix** (not word "wheelthrowing")
- **Highlighting logic MUST NOT check `isSelected`** - applies color unconditionally
