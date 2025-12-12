# CLASS DISPLAY FIX - DO NOT REVERT

**Date Fixed**: Nov 15, 2025
**Issue**: Classes not showing on /classes or /admin/classes pages

## The Problem

The `/api/admin/classes` endpoint had a filter at line 2079 that was hiding courses:

```javascript
// BAD - This filters out most courses!
const filteredCourses = courses.filter(course => course.totalEnrollment >= 4);
```

This meant that **only courses with 4 or more enrolled students would display**. For new courses or courses with low enrollment, nothing would show up.

## The Fix (PERMANENT)

**File**: `server/index.js`
**Line**: ~2078-2084

```javascript
// GOOD - Show ALL courses regardless of enrollment
// Admin should see all courses to manage them properly
const filteredCourses = courses; // No filtering - show all courses

console.log(`✅ Successfully fetched and processed ${allClassInstances.length} classes in ${filteredCourses.length} courses`);

res.json({ courses: filteredCourses });
```

## Why This Keeps Getting Reverted

This filter was likely added in the past to reduce clutter, but it breaks the admin interface. **DO NOT add enrollment filters to the admin endpoint** - admins need to see ALL courses to:

1. Manage empty/low-enrollment classes
2. Cancel classes that aren't filling up
3. See the full schedule
4. Debug booking issues

## How Classes Are Stored

Classes are synced from Shopify using:
1. `create_classes_from_shopify.js` - Creates class instances
2. `create_bookings_from_shopify_orders.js` - Creates student bookings

Class identifiers follow CLASS_SCHEDULE_RULES.md:
- Format: `WT1801AM_DL6.1`
  - WT = Wheelthrowing
  - 1801 = Jan 18 (DDMM format)
  - AM = 9:30 AM class
  - DL = Dillon Lin
  - 6 = 6-week course
  - .1 = Week 1

## Testing After Changes

Always test both endpoints:

```bash
# Test student endpoint (200 classes limit)
curl http://localhost:3000/api/classes/available

# Test admin endpoint (needs auth token, shows ALL courses)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/admin/classes
```

## Database Commands

```bash
# Check total classes
node -e "require('dotenv').config(); const {supabase} = require('./utils/supabaseDb'); supabase.from('class_instances').select('*', {count: 'exact', head: true}).then(r => console.log('Total classes:', r.count))"

# Re-sync from Shopify if needed
node create_classes_from_shopify.js
node create_bookings_from_shopify_orders.js
```

## IMPORTANT NOTE

**If classes are not showing, the issue is likely:**
1. ❌ An enrollment filter was added back (check line 2078-2084)
2. ❌ Database was wiped (check total count)
3. ❌ Shopify sync hasn't run (re-run sync scripts)

**It is NOT because:**
- ✅ The API endpoints are working correctly
- ✅ Classes are in the database (244 classes)
- ✅ Frontend is rendering properly

Keep this file in the repository root as a permanent reminder!
