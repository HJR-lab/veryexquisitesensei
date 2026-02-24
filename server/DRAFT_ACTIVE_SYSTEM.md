# Draft/Active Class System

## Overview

The course enrollment system now automatically creates classes immediately when the **first student** enrolls, and automatically activates them when **4 or more students** are enrolled.

## How It Works

### 1st Student Enrolls
- ✅ **DRAFT classes created automatically**
- Bookings created for the student
- Classes visible to admin (marked as DRAFT)
- Status: `draft` in database

### 2nd-3rd Student Enrolls
- ✅ **Added to existing DRAFT classes**
- Bookings created for new student
- Classes remain DRAFT
- Status: `draft` in database

### 4th Student Enrolls
- ✅ **Classes automatically ACTIVATED**
- Bookings created for new student
- All draft classes updated to `active` status
- Course is now confirmed and live!

### 5+ Students Enroll
- ✅ **Added to ACTIVE classes**
- Bookings created for new student
- Classes remain `active`

## Benefits

### ✅ **Fully Automatic**
- No manual intervention needed
- Classes created instantly when first student purchases
- Auto-activation when threshold met

### ✅ **Better Visibility**
- Admins can see upcoming courses immediately
- Students can be notified as courses fill up
- Clear draft vs active status

### ✅ **No More Waiting**
- Students don't wait in limbo
- Bookings exist from day 1
- Calendar shows draft courses

### ✅ **Seamless Activation**
- 4th student triggers automatic activation
- All students already booked and ready
- No manual class creation needed

## System Components

### Webhook (Real-time)
**File:** `/api/shopify/webhook/orders` in `index.js`
- Processes new orders from Shopify
- Creates enrollments and classes immediately
- Sets status based on student count

### Cron Job (Daily 2am)
**File:** `cohortAutoProcessor.js`
- Scans for enrollments without classes
- Creates draft/active classes based on count
- Activates drafts that reach threshold

### Manual Script
**File:** `process-ready-cohorts.js`
- Run anytime: `node process-ready-cohorts.js`
- Processes all pending enrollments
- Creates draft or active classes

## Database Schema

### class_instances table
```sql
status TEXT NOT NULL DEFAULT 'active'
```

Values:
- `'draft'` - Course has 1-3 students (waiting for 4)
- `'active'` - Course has 4+ students (confirmed)
- `'cancelled'` - Course was cancelled

## Frontend Display

### Class Management Page
Draft classes should show:
- 📝 DRAFT badge
- Student count: "3/4 needed"
- Grey/muted styling

Active classes should show:
- ✅ ACTIVE badge
- Student count: "5 enrolled"
- Normal styling

## Example Flow

### Wheelthrowing Course - Saturdays 9:30am

**Dec 8, 2025:**
- Beverly Tan purchases → **DRAFT classes created** (1/4 students)
- 6 classes created with status='draft'
- 1 enrollment, 6 bookings

**Dec 25, 2025:**
- Sue Ann Teng purchases → Added to draft (2/4 students)
- 1 enrollment, 6 bookings
- Total: 2 enrollments, 12 bookings

**Dec 26, 2025:**
- Veronica Yeo purchases → Added to draft (3/4 students)
- 1 enrollment, 6 bookings
- Total: 3 enrollments, 18 bookings

**Dec 30, 2025:**
- Emily Fraser purchases → **CLASSES ACTIVATED!** (4/4 students)
- 1 enrollment, 6 bookings
- **All 6 classes updated to status='active'**
- Total: 4 enrollments, 24 bookings

**Dec 30, 2025 (later):**
- Inge Bukit purchases → Added to active (5 students)
- 1 enrollment, 6 bookings
- Total: 5 enrollments, 30 bookings

**Dec 30, 2025 (later):**
- Edith Lee purchases → Added to active (6 students)
- 1 enrollment, 6 bookings
- **Total: 6 enrollments, 36 bookings**

## Implementation Complete ✅

All three systems (webhook, cron, manual script) now:
1. Create classes immediately for first student
2. Set status='draft' for <4 students
3. Set status='active' for >=4 students
4. Auto-activate when 4th student enrolls

No changes needed to:
- Database schema (status field already exists)
- Course scheduling logic
- Booking creation
- Enrollment tracking
