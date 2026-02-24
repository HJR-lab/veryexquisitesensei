# Handbuilding Credit System

## ⚠️ CRITICAL SETUP REQUIREMENT

**HB CLASSES MUST BE CREATED IN THE DATABASE FIRST!**

Unlike wheelthrowing courses that are created dynamically, **handbuilding classes must be pre-created** in the `class_instances` table.

### If HB Classes Are Missing:

```bash
# Run this script to create all Wednesday HB classes
node server/create-hb-classes.js
```

This creates 68 Wednesday classes (7-9pm) from Sept 17, 2025 through Dec 31, 2026.

**Without running this script, NO HB classes will appear in:**
- Admin Class Management page
- Student booking calendar
- Any class listings

### How to Verify HB Classes Exist:

```bash
# Check if HB classes are in database
node server/check-hb-classes.js
```

You should see 68 total HB classes. If you see 0, run the creation script above.

---

## Overview

The Handbuilding (HB) system works differently from Wheelthrowing (WT) courses:

- **WT Courses**: Fixed 6-week cohorts, auto-booked when 4+ students enroll
- **HB Courses**: Credit-based drop-in system, students self-register for specific Wednesdays

## Features

### Credit System
- Students purchase **4 or 8 class credits** (no expiry date)
- Credits can be used for:
  - Any Wednesday HB class (7-9pm)
  - WT glazing classes (week 6 of any WT course) - **limited to 1 glazing class per HB package**
- No automatic booking creation
- Students choose which classes to attend

### Class Schedule
- **Every Wednesday 7-9pm** ongoing from **Sept 17, 2025** through **Dec 31, 2026**
- Instructor: Lynette Ting (LT)
- Capacity: 12 students
- Room: Main Studio

### Class Techniques
Each HB class has a technique type set by the instructor:
- Coiling
- Pinching
- Slabwork
- Glazing

Students can see the technique when choosing which Wednesday to attend.

### Glazing Class Access
- HB students can use 1 credit to attend WT glazing classes (week 6)
- Week 6 glazing classes identified by class codes ending in `.6`
- Glazing classes have increased capacity: **15 students** (vs 10 for regular weeks)

## Implementation

### Database Schema Changes

The following columns were added:

**course_enrollments table:**
```sql
class_credits_allocated INT DEFAULT 0    -- Total credits purchased (4 or 8)
class_credits_used INT DEFAULT 0         -- Credits already used
class_credits_remaining INT DEFAULT 0    -- Credits available
glazing_class_used BOOLEAN DEFAULT FALSE -- Tracks if student used their 1 glazing credit
```

**class_instances table:**
```sql
class_technique VARCHAR(50)  -- Technique type: coiling, pinching, slabwork, glazing
```

**Updates:**
- All week 6 glazing classes updated to `max_capacity = 15` and `class_technique = 'glazing'`

### Code Changes

**utils/courseEnrollmentManager.js**
- Modified `processCoursePurchase()` to detect Handbuilding courses
- HB courses now:
  - Allocate credits based on `number_of_weeks` (4 or 8)
  - Skip automatic booking creation
  - Set status to 'active' immediately
  - Return credit allocation details

**Shopify Import**
- When a HB course order comes in from Shopify:
  - Enrollment created with credits allocated
  - No classes or bookings created
  - Student can later self-register for specific Wednesdays

## Setup Instructions

### 1. Run Database Migration

Go to Supabase dashboard:
https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/editor

Run the SQL from: `migrations/add-credit-system.sql`

Or run:
```bash
node add-credit-columns.js
```

This will display the SQL to copy/paste.

### 2. Create Recurring HB Classes

```bash
node create-hb-classes.js
```

This creates ~70 Wednesday HB classes from Sept 17, 2025 through Dec 31, 2026.

### 3. Convert Existing HB Students

```bash
node convert-hb-students-to-credits.js
```

This converts the 3 existing HB students:
- Jane Lee: 4 credits
- Wong Ting Chi: 4 credits
- Kenjun Lim: 4 credits

Removes their auto-created bookings (they'll self-register instead).

### 4. Verify Setup

Run the setup script to see status:
```bash
node setup-handbuilding-system.js
```

## Files Created

- `migrations/add-credit-system.sql` - Database migration SQL
- `create-hb-classes.js` - Creates recurring Wednesday HB classes
- `convert-hb-students-to-credits.js` - Converts existing HB students
- `setup-handbuilding-system.js` - Master setup script with instructions
- `HANDBUILDING_CREDIT_SYSTEM.md` - This documentation

## Usage Examples

### New HB Student Purchase from Shopify

When a student orders "Handbuilding - 4 Classes" from Shopify:

1. Order is synced via Shopify webhook
2. `processCoursePurchase()` is called
3. Detects "Handbuilding" in course name
4. Creates enrollment with:
   - `class_credits_allocated = 4`
   - `class_credits_used = 0`
   - `class_credits_remaining = 4`
   - `glazing_class_used = false`
   - `status = 'active'`
5. **No bookings created**
6. Student receives email to self-register for classes

### Student Self-Registration

**Frontend flow (to be implemented):**

1. Student logs in and sees their credits: "You have 4 HB credits"
2. Student browses Wednesday HB classes
3. Each class shows:
   - Date and time
   - Technique type (e.g., "Coiling")
   - Capacity (e.g., "8/12 enrolled")
4. Student clicks "Register" on desired Wednesday
5. System:
   - Creates booking
   - Decrements `class_credits_remaining`
   - Increments `class_credits_used`
   - Updates class `current_enrollment`

### Student Registers for WT Glazing

1. Student sees available WT glazing classes (week 6)
2. Class shows "HB students can use 1 credit"
3. If `glazing_class_used = false`:
   - Student can register
   - System sets `glazing_class_used = true`
   - Decrements remaining credits
4. If `glazing_class_used = true`:
   - Show message: "You have already used your glazing class credit"

## Next Steps

### Backend API Endpoints (to be created)

```javascript
// Get available HB classes for student
GET /api/student/hb-classes
// Returns: Wednesday HB classes with technique and availability

// Register for HB class
POST /api/student/hb-classes/:classId/register
// Body: { studentId, useCredit: true }
// Returns: booking confirmation

// Get student's credit balance
GET /api/student/credits
// Returns: { allocated, used, remaining, glazingUsed }

// Get available glazing classes for HB students
GET /api/student/glazing-classes
// Returns: Week 6 glazing classes from all WT cohorts
```

### Frontend Components (to be created)

- **HB Class Calendar**: Show all Wednesday HB classes
- **Credit Balance Widget**: Display student's remaining credits
- **Technique Filter**: Filter HB classes by technique type
- **Glazing Class Browser**: Show available WT glazing classes
- **Registration Modal**: Confirm credit usage and booking

### Admin Features (to be created)

- **Set Class Technique**: Admin/instructor can set technique for each Wednesday
- **View HB Enrollments**: See all students with credits and usage
- **Manual Credit Adjustment**: Add/remove credits for special cases
- **HB Class Management**: Edit/delete HB classes, view enrollments

## Technical Notes

### Class Naming Convention

**Wheelthrowing**: `WT2504NT_JL6.3`
- `WT` = Wheelthrowing
- `2504` = April 2025
- `NT` = Night (Tuesday)
- `JL` = Joyce Lim
- `6` = 6-week course
- `.3` = Week 3

**Handbuilding**: `HB_170925_LT`
- `HB` = Handbuilding
- `170925` = Sept 17, 2025 (DDMMYY)
- `LT` = Lynette Ting

### Week 6 Glazing Detection

```javascript
// Check if class is week 6 glazing
const isGlazingClass = classType.endsWith('.6');

// Get all glazing classes
const glazingClasses = await supabase
  .from('class_instances')
  .select('*')
  .like('class_type', '%.6')
  .eq('class_technique', 'glazing');
```

### Credit Validation

```javascript
// Check if student has credits
if (enrollment.class_credits_remaining < 1) {
  throw new Error('No credits remaining');
}

// Check if trying to book glazing
if (isGlazingClass && enrollment.glazing_class_used) {
  throw new Error('Glazing class credit already used');
}

// Validate booking
if (classInstance.current_enrollment >= classInstance.max_capacity) {
  throw new Error('Class is full');
}
```

## Benefits

1. **Flexibility**: Students choose which Wednesdays to attend
2. **No Expiry**: Credits never expire
3. **Cross-Course Access**: Use HB credits for WT glazing
4. **Technique Choice**: Students can select preferred techniques
5. **Simplified Management**: No cohort matching or threshold logic
6. **Better Capacity**: Glazing classes accommodate more students (15 vs 10)

## Migration Path

### Before (Incorrect HB Setup)
- HB treated like WT with fixed cohorts
- Auto-booking creation (wrong)
- 4-student threshold applied (wrong)
- Students couldn't choose specific dates

### After (Correct HB Setup)
- Credit-based system
- Self-registration
- No threshold
- Students choose Wednesdays
- Access to WT glazing classes
- Technique-based selection
