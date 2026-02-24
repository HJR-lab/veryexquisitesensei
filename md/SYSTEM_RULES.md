# VES Pottery Gallery - System Rules

> **Last Updated:** 2025-12-28
> **Status:** ACTIVE - These are the current system rules

---

## ⚠️ CRITICAL RULES - READ FIRST

### 1. HANDBUILDING CLASSES MUST BE PRE-CREATED

**HB classes DO NOT auto-create like wheelthrowing classes!**

If someone reports "HB classes are missing" or "Wednesday classes don't show":

```bash
# Check if HB classes exist
node server/check-hb-classes.js

# If output shows "0 HB classes", run:
node server/create-hb-classes.js
```

**This creates 68 Wednesday HB classes (7-9pm) from Sept 2025 to Dec 2026.**

Without this step:
- ❌ No HB classes in Admin Class Management
- ❌ No HB classes in student booking calendar
- ❌ Students cannot book HB classes

### 2. Two Different Class Systems

**Wheelthrowing (WT):**
- Auto-creates classes when cohorts form
- Fixed 6-week or 7-week courses
- Format: `WT1210AM_DL6.1` (includes week number)
- Students auto-booked when 4+ enroll

**Handbuilding (HB):**
- Must pre-create classes using script
- Credit-based drop-in system (4 or 8 credits)
- Format: `HB_170925_LT` (date-based, no week number)
- Students self-register for specific Wednesdays

---

## Class Schedule & Instructors

### Dillon Lin (DL)
- **Days:** Saturday, Sunday
- **Type:** Wheelthrowing (Beginner & Intermediate)
- **Times:** 9:30am-12pm, 1pm-3:30pm (Sat only)
- **Holiday:** Nov 17, 2025 - Jan 14, 2026

### Joyce Lim (JL)
- **Days:** Tuesday, Thursday, Friday
- **Type:** Wheelthrowing (Beginner & Intermediate)
- **Times:** 9:30am-12pm, 7pm-9:30pm
- **Holiday:** Nov 26, 2025 - Jan 14, 2026

### Lynette Ting (LT)
- **Days:** Wednesday ONLY
- **Type:** Handbuilding
- **Time:** 7pm-9pm
- **Format:** Ongoing weekly (credit-based)

---

## Class Naming Conventions

### Wheelthrowing: `WT[DDMM][TIME]_[INSTRUCTOR][WEEKS].[WEEK#]`

Examples:
- `WT1210AM_DL6.1` = WT, starts Dec 10, 9:30am, Dillon Lin, 6-week course, Week 1
- `WT2110NT_JL6.3` = WT, starts Oct 21, 7pm night, Joyce Lim, 6-week course, Week 3
- `WT0410PM_DL7.5` = WT, starts Oct 4, 1pm, Dillon Lin, 7-week intermediate, Week 5

**Time Codes:**
- `AM` = 9:30am
- `PM` = 1:00pm
- `NT` = 7:00pm (Night Time)

### Handbuilding: `HB_[DDMMYY]_[INSTRUCTOR]`

Examples:
- `HB_170925_LT` = HB, Sept 17, 2025, Lynette Ting
- `HB_241225_LT` = HB, Dec 24, 2025, Lynette Ting
- `HB_070126_LT` = HB, Jan 7, 2026, Lynette Ting

**No week numbers** - each Wednesday is an independent class

---

## Database Tables & Key Fields

### `class_instances` - All Classes

**All Classes:**
- `class_date` - YYYY-MM-DD format
- `start_time` - "9:30 AM", "1:00 PM", "7:00 PM"
- `end_time` - "12:00 PM", "3:30 PM", "9:30 PM"
- `instructor` - "Dillon Lin", "Joyce Lim", "Lynette Ting"
- `max_capacity` - 8 for WT, 12 for HB
- `current_enrollment` - Auto-tracked via bookings
- `class_type` - Full identifier (e.g., `WT1210AM_DL6.1` or `HB_170925_LT`)

**HB-Specific:**
- `class_technique` - "coiling", "pinching", "slabwork", "glazing"

### `course_enrollments` - Student Enrollments

**WT Courses:**
- Auto-creates bookings for all 6 or 7 weeks
- `status`: 'pending' → 'active' (when 4+ students)

**HB Credit System:**
- `class_credits_allocated` - Total credits purchased (4 or 8)
- `class_credits_used` - Credits already spent
- `class_credits_remaining` - Credits available
- `glazing_class_used` - Boolean (can use 1 credit for WT glazing)
- NO auto-booking creation

### `bookings` - Individual Class Bookings

**WT Bookings:**
- Auto-created for entire 6 or 7 week course
- One booking per week

**HB Bookings:**
- Created when student self-registers
- Each booking uses 1 credit
- Can be non-consecutive weeks

---

## Capacity Rules

### Wheelthrowing
- **Teaching:** 8 students (8 wheels)
- **Make-up:** +2 spots for rescheduled students
- **Glazing (Week 6):** 15 students (increased capacity)

### Handbuilding
- **Standard:** 12 students per Wednesday

---

## Credit & Reschedule System

### HB Credit System
- Students purchase 4 or 8 class credits
- Credits **never expire**
- Can use 1 credit for any WT glazing class (week 6)
- Self-register for specific Wednesday classes
- Can skip weeks (non-consecutive attendance)

### WT Reschedule Fees
- **Within course (same 6 weeks):** FREE
- **Glazing class (week 6):** FREE to book up to 2 courses ahead
- **Makeup in next course:** $40 per class

---

## Quick Troubleshooting

### "HB classes not showing"
```bash
node server/check-hb-classes.js  # Should show 68 classes
node server/create-hb-classes.js # If 0 classes found
```

### "Need to verify HB system is set up"
```bash
node server/setup-handbuilding-system.js
```

### "Check recent orders/enrollments"
```bash
node server/check-recent-orders.js
node frontend/check-recent-orders.js
```

---

## Documentation Files

- **`/CLASS_SCHEDULE_RULES.md`** - Class format, naming, schedule rules
- **`/server/HANDBUILDING_CREDIT_SYSTEM.md`** - Complete HB system guide
- **`/server/AUTOMATED-SYSTEM-GUIDE.md`** - Shopify → enrollment automation
- **`/CALENDAR_AND_ENROLLMENT_SYSTEM.md`** - Frontend calendar implementation
- **`/SYSTEM_RULES.md`** - This file (master reference)

---

## Key Differences: WT vs HB

| Feature | Wheelthrowing (WT) | Handbuilding (HB) |
|---------|-------------------|-------------------|
| **Class Creation** | Auto-creates when cohort forms | **Must pre-create with script** |
| **Format** | `WT1210AM_DL6.1` (with week #) | `HB_170925_LT` (date-based) |
| **Booking** | Auto-books all 6/7 weeks | Student self-registers |
| **Schedule** | Fixed consecutive weeks | Flexible, can skip weeks |
| **Threshold** | 4 students to start | No threshold |
| **Credits** | N/A | 4 or 8 credits, never expire |
| **Capacity** | 8 teaching + 2 makeup | 12 students |

---

## Recent Changes

**2025-12-28:**
- Created 68 HB classes from Sept 2025 to Dec 2026
- Updated documentation to emphasize HB classes must be pre-created
- Created SYSTEM_RULES.md as master reference
- Updated CLASS_SCHEDULE_RULES.md with current HB format
- Updated HANDBUILDING_CREDIT_SYSTEM.md with critical setup warning

---

**For more details, see the documentation files listed above.**
