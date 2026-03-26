# VES Pottery Gallery - Complete System Documentation

> **Last Updated:** 2026-03-26
> **Status:** ACTIVE - Complete system reference

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Critical Setup Requirements](#critical-setup-requirements)
3. [Quick Start Guide](#quick-start-guide)
4. [Class Schedule System](#class-schedule-system)
5. [Calendar and Enrollment System](#calendar-and-enrollment-system)
6. [Handbuilding Credit System](#handbuilding-credit-system)
7. [Automated Course Processing](#automated-course-processing)
8. [Authentication System (Magic Link)](#authentication-system-magic-link)
9. [Deployment Guide](#deployment-guide)
10. [API Reference](#api-reference)
11. [Troubleshooting](#troubleshooting)

---

## System Overview

A professional student pottery portfolio and class management system for VES Pottery Studio built on Shopify customer accounts.

### Key Features

- **Personal Student Gallery**: Grid view of completed pottery pieces with detailed specifications
- **Class Management**: Full admin interface for managing classes, enrollments, and bookings
- **Automated Course Creation**: Classes auto-create when enrollment thresholds are met
- **Credit-Based Handbuilding**: Flexible drop-in system for handbuilding classes
- **Magic Link Auth**: Passwordless sign-in via Supabase Auth + Resend SMTP
- **Membership System**: Clay Club memberships with studio access tracking
- **Reschedule System**: Students can reschedule within courses or makeup later
- **Real-time Calendar**: Shared calendar component for both admin and student views
- **Auto Attendance**: Past bookings automatically marked as attended daily

### Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Express.js + Node.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (magic link via email OTP)
- **Email**: Resend SMTP (`noreply@mail.ves.sg`)
- **Integration**: Shopify Admin API + Webhooks
- **Deployment**: Vercel (frontend) + Railway (backend)

---

## Critical Setup Requirements

### ⚠️ HANDBUILDING CLASSES MUST BE PRE-CREATED

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
- No HB classes in Admin Class Management
- No HB classes in student booking calendar
- Students cannot book HB classes

### Two Different Class Systems

**Wheelthrowing (WT):**
- Auto-creates classes when cohorts form (4+ students)
- Fixed 6-week or 7-week courses
- Format: `WT1210AM_DL6.1` (includes week number)
- Students auto-booked when threshold met

**Handbuilding (HB):**
- Must pre-create classes using script
- Credit-based drop-in system (4 or 8 credits)
- Format: `HB_170925_LT` (date-based, no week number)
- Students self-register for specific Wednesdays

---

## Quick Start Guide

### 1. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Create `server/.env`:

```env
# Shopify Credentials
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SHOP_DOMAIN=ves-sg.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token

# Supabase Database + Auth
SUPABASE_URL=https://fpdbfbxpthmaceuspcrf.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_ANON_KEY=your_supabase_anon_key

# Impersonation cookie signing
COOKIE_SECRET=your_cookie_secret_here

# Configuration
FRONTEND_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=https://fpdbfbxpthmaceuspcrf.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Create Required Database Tables

Run in Supabase SQL Editor:

1. **verification_codes table** (for email verification):
```sql
CREATE TABLE verification_codes (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_codes_customer_id ON verification_codes(customer_id);
CREATE INDEX idx_verification_codes_email ON verification_codes(email);
```

2. **Add credit system columns** (for handbuilding):
```sql
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS class_credits_allocated INT DEFAULT 0;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS class_credits_used INT DEFAULT 0;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS class_credits_remaining INT DEFAULT 0;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS glazing_class_used BOOLEAN DEFAULT FALSE;

ALTER TABLE class_instances ADD COLUMN IF NOT EXISTS class_technique VARCHAR(50);
```

### 4. Create Handbuilding Classes

```bash
cd server
node create-hb-classes.js
```

Expected output: "Created 68 HB classes"

### 5. Start the Application

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

Should see:
```
🎨 VES Pottery Gallery API running on port 3000
[Auto-Processor] ✅ Automatic daily processing scheduled (runs at 2:00 AM)
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Should see:
```
VITE v5.0.8  ready in 500 ms
➜  Local:   http://localhost:5173/
```

### 6. Test the Application

1. Visit `http://localhost:5173/login`
2. Enter any email that exists in the `customers` table (e.g., `info@ves.sg` for admin)
3. Click "Send Sign-In Link" — check email for magic link
4. Click magic link → auto-redirects to appropriate dashboard

---

## Class Schedule System

### Instructors & Schedule

#### Dillon Lin (DL)
- **Days:** Saturday, Sunday
- **Type:** Wheelthrowing (Beginner & Intermediate)
- **Times:** 9:30am-12pm, 1pm-3:30pm (Sat only)
- **Holiday:** Nov 17, 2025 - Jan 14, 2026

#### Joyce Lim (JL)
- **Days:** Tuesday, Thursday, Friday
- **Type:** Wheelthrowing (Beginner & Intermediate)
- **Times:** 9:30am-12pm, 7pm-9:30pm
- **Holiday:** Nov 26, 2025 - Jan 14, 2026

#### Lynette Ting (LT)
- **Days:** Wednesday ONLY
- **Type:** Handbuilding
- **Time:** 7pm-9pm
- **Format:** Ongoing weekly (credit-based)

### Class Naming Conventions

#### Wheelthrowing: `WT[DDMM][TIME]_[INSTRUCTOR][WEEKS].[WEEK#]`

Examples:
- `WT1210AM_DL6.1` = WT, starts Dec 10, 9:30am, Dillon Lin, 6-week course, Week 1
- `WT2110NT_JL6.3` = WT, starts Oct 21, 7pm night, Joyce Lim, 6-week course, Week 3
- `WT0410PM_DL7.5` = WT, starts Oct 4, 1pm, Dillon Lin, 7-week intermediate, Week 5

**Time Codes:**
- `AM` = 9:30am
- `PM` = 1:00pm
- `NT` = 7:00pm (Night Time)

**Instructor Codes:**
- `JL` = Joyce Lim
- `DL` = Dillon Lin
- `LT` = Lynette Ting

#### Handbuilding: `HB_[DDMMYY]_[INSTRUCTOR]`

Examples:
- `HB_170925_LT` = HB, Sept 17, 2025, Lynette Ting
- `HB_241225_LT` = HB, Dec 24, 2025, Lynette Ting
- `HB_070126_LT` = HB, Jan 7, 2026, Lynette Ting

**No week numbers** - each Wednesday is an independent class

### Capacity Rules

#### Wheelthrowing
- **Teaching:** 8 students (8 wheels)
- **Make-up:** +2 spots for rescheduled students
- **Glazing (Week 6):** 15 students (increased capacity)

#### Handbuilding
- **Standard:** 12 students per Wednesday

### Course Structure

#### Wheelthrowing Beginner
- **Duration:** 6 weeks
- **Format:** Fixed 6-week courses with specific start dates
- **Students must:** Complete all 6 consecutive weeks
- **Threshold:** 4+ students to start

#### Wheelthrowing Intermediate
- **Duration:** 7 weeks
- **Format:** Fixed 7-week courses with specific start dates
- **Students must:** Complete all 7 consecutive weeks
- **Threshold:** 4+ students to start

#### Handbuilding
- **Duration:** Flexible (4 or 8 weeks depending on purchase)
- **Format:** Ongoing weekly classes every Wednesday
- **Students can:**
  - Start any Wednesday
  - Attend 4 or 8 weeks based on their package purchase
  - Book specific Wednesday classes to use their credits
  - Skip weeks (non-consecutive attendance)

### Reschedule & Pause System

#### 24-Hour Cutoff Rule (NEW - Jan 2026)
- **Students CANNOT reschedule within 24 hours of class start time**
- Classes within 24 hours are automatically marked as attended
- Reschedule button shows "Within 24h" and is disabled
- Both frontend and backend enforce this rule
- Example: Class on Tuesday 7pm → Cannot reschedule after Monday 7pm

#### Cohort Restrictions for 6-Week WT Courses (NEW - Jan 2026)

**Standard 6-Week Wheelthrowing Courses:**
- **Weeks 1-5:** Students MUST reschedule within their cohort period
  - Example: Jan 17 - Mar 3 cohort → Can only reschedule to classes between these dates
  - Cannot move to next cohort without $40 makeup fee
- **Week 6 Glazing:** Special exception - can reschedule to ANY future glazing class
  - No cohort restriction for glazing classes
  - Can attend glazing class from a later cohort

**WT 10-Class Package Exception:**
- Identified by: `classes_allocated = 10` AND `course_expiry_date IS NULL`
- **No cohort restrictions** for classes 1-9
- Can reschedule to any available class across any cohort
- **10th/Final class MUST be a glazing class (Week 6)**
- System enforces glazing requirement on last booking
- Example: Joey Lee (first 10-class package customer)

#### Within Current Course (No Fee)
- Students can reschedule to a different time slot on the same day/week within their current 6-week course
- Example: Tuesday 7pm student can reschedule to Thursday 7pm for the same week
- Subject to 24-hour cutoff rule

#### Glazing Class (Week 6.6) - Special Rule
- **No fee required**: Students can book their glazing class up to **2 courses ahead**
- Example: Student in Oct course (weeks 1-5) can attend glazing in Dec course
- Reason: Glazing is flexible timing and doesn't need to be immediate after week 5
- Can reschedule to any future glazing class regardless of cohort

#### Next Course Makeup (with Fee)
- **$40 per class fee**: Students who miss classes and want to make them up in the next course
- Fee applies to all classes except glazing (6.6)
- Example: Missed week 3 in Oct course → Can make up week 3 in Nov course for $40

#### Pause System
- Students can pause their course mid-way (e.g., completed weeks 1-3, pause at week 4)
- They resume in a future course from where they left off (weeks 4, 5, 6)
- **Pause fee**: $40 per makeup class in the next course

---

## Calendar and Enrollment System

### Shared Calendar Component

Both admin and student views use the **same calendar component**: `ClassCalendar`

**Component Location:** `/frontend/src/components/ClassCalendar.jsx`

### Pages Using the Calendar

#### 1. Student/Public Classes Page (`/classes`)
- **File:** `/frontend/src/pages/ClassScheduleNew.jsx`
- **Route:** `/classes`
- **Calendar Props:** `isAdminView={false}`
- Shows student-facing features (enrollment, rescheduling, waitlist)
- Hides capacity numbers from students

#### 2. Admin Classes Page (`/admin/classes`)
- **File:** `/frontend/src/pages/AdminClasses.jsx`
- **Route:** `/admin/classes`
- **Calendar Props:** `isAdminView={true}`
- Shows admin-facing features (member lists, enrollment counts)
- Displays enrollment as "X/8 enrolled"

### Course Highlighting System

#### Default Light Orange Highlights

ALL wheelthrowing classes (weeks 6.1-6.5) are highlighted in **light orange by default** on the calendar.

**Visual Behavior:**
1. **Default State:** ALL wheelthrowing classes show with light orange background (`bg-orange-500/20`)
2. **Glazing Week:** Week 6.6 (glazing classes) show with light brown background (`bg-amber-800/30`)
3. **Clicked Course:** When clicking a course, all 6 weeks turn dark orange (`bg-accent text-white`)

**Implementation:** `frontend/src/components/ClassCalendar.jsx` (Lines 103-123)

```javascript
// Show light orange for all wheelthrowing classes EXCEPT glazing week (.6)
if (!hasGlazingClass) {
  if (classTypeFilter === 'all' && dayClasses.length > 0) {
    const classCategories = [...new Set(dayClasses.map(c => getClassCategory(c.class_type)))];
    const config = classTypeConfig[classCategories[0]];
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

#### Public Holiday Highlighting

Classes on public holidays show **light blue** background:

```javascript
const isPublicHoliday = classInstance.cancellation_reason?.includes('Public Holiday');
// Apply: className={isPublicHoliday ? 'public-holiday bg-blue-100' : ''}
```

**2026 Public Holidays:**
- `WT2001NT_JL6.2` - Tuesday, Jan 27, 2026 - Chinese New Year
- `HB_280126_LT` - Wednesday, Jan 28, 2026 - Chinese New Year (Day 2)

### Enrollment Counting System

#### Pagination (CRITICAL)

The system has **1143+ bookings** which exceeds Supabase's default limit of 1000 rows.

**Solution:** Pagination to fetch ALL bookings

**File:** `server/index.js` (lines 2047-2071)

```javascript
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

  if (error) throw error;

  bookingCounts = bookingCounts.concat(data);
  hasMore = data.length === pageSize;
  page++;
}
```

#### Unique Student Counting

**Problem:** A 6-week course with 7 students creates 42 bookings (7 × 6)

**Solution:** Use JavaScript `Set` to count **unique** `student_id` values

```javascript
courses.forEach(course => {
  const uniqueStudents = new Set();
  course.classes.forEach(cls => {
    cls.bookingCount = bookingCountsByClass[cls.id] || 0;
    bookingCounts
      .filter(b => b.class_instance_id === cls.id)
      .forEach(b => uniqueStudents.add(b.student_id));
  });
  course.totalEnrollment = uniqueStudents.size; // Count of unique students
});
```

### Database Schema

#### class_instances table
- `class_date` - YYYY-MM-DD format
- `start_time` - "9:30 AM", "1:00 PM", "7:00 PM"
- `end_time` - "12:00 PM", "3:30 PM", "9:30 PM"
- `max_capacity` - 8 for WT, 12 for HB, 15 for glazing
- `current_enrollment` - Auto-tracked via bookings
- `class_type` - Full identifier (e.g., `WT1210AM_DL6.1`)
- `status` - 'draft', 'active', 'cancelled'
- `class_technique` - For HB: 'coiling', 'pinching', 'slabwork', 'glazing'
- `cancellation_reason` - For holidays: "Public Holiday: [name]"

#### course_enrollments table
- `student_id` - Link to customer
- `course_name` - Course title
- `course_type` - 'wheelthrowing' or 'handbuilding'
- `schedule_pattern` - Day of week
- `class_time` - Time slot
- `course_start_date` - Start date
- `status` - 'pending', 'active', 'confirmed', 'completed'
- `class_credits_allocated` - For HB: Total credits (4 or 8)
- `class_credits_used` - For HB: Credits spent
- `class_credits_remaining` - For HB: Available credits
- `glazing_class_used` - For HB: Boolean flag

#### bookings table
- `student_id` - Link to customer
- `class_instance_id` - Link to class
- `status` - 'booked', 'completed', 'rescheduled', 'cancelled'
- `attended` - Boolean

---

## Handbuilding Credit System

### Overview

HB courses use a **credit-based drop-in system** instead of fixed cohorts.

### How It Works

1. **Purchase:** Student buys 4 or 8 class credits
2. **Enrollment:** Credit allocation is recorded
3. **Self-Registration:** Student chooses specific Wednesday classes
4. **Booking:** Each booking uses 1 credit
5. **Flexibility:** Students can skip weeks, attend non-consecutively

### Credit Rules

- **Never Expire:** Credits have no expiration date
- **Glazing Access:** Can use 1 credit for any WT glazing class (week 6)
- **Technique Choice:** Each Wednesday has a different technique (coiling, pinching, slabwork)
- **Capacity:** 12 students per Wednesday

### Glazing Class Access

HB students can use **1 credit** to attend WT glazing classes:
- Week 6 glazing classes identified by `.6` suffix
- Glazing classes have increased capacity: **15 students**
- Tracked by `glazing_class_used` boolean flag
- Once used, cannot book another glazing class

### Setup Instructions

#### 1. Create HB Classes

```bash
node server/create-hb-classes.js
```

Creates 68 Wednesday classes from Sept 2025 to Dec 2026.

#### 2. Verify HB Classes

```bash
node server/check-hb-classes.js
```

Should show 68 total classes.

#### 3. Check HB System Status

```bash
node server/setup-handbuilding-system.js
```

Shows current setup status and any issues.

### Shopify Integration

When a student purchases "Handbuilding - 4 Classes" or "Handbuilding - 8 Classes":

1. Webhook fires → `/api/shopify/webhook/orders`
2. System detects "Handbuilding" in course name
3. Creates enrollment with credits allocated
4. **No automatic bookings created**
5. Student can later self-register for specific Wednesdays

### Frontend Implementation (To Be Created)

**Student View:**
- Credit balance widget: "You have 4 HB credits"
- HB class calendar with technique filter
- Register button for each Wednesday
- Glazing class browser (if credits remaining and not used)

**Admin View:**
- Set class technique for each Wednesday
- View HB enrollments and credit usage
- Manual credit adjustment

---

## Automated Course Processing

### Overview

The system has **three automatic processing mechanisms**:

1. **Real-Time Webhook** - Processes orders as they come from Shopify
2. **Daily Cron Job** - Runs at 2:00 AM to catch any missed cohorts
3. **Manual Script** - Can be triggered anytime by admin

### How It Works

#### 1. Real-Time Processing (Webhook)

When a student purchases a course on Shopify:

```
Order Created → Webhook Fires → Create Enrollment
                                       ↓
                        Check: Is this Wheelthrowing or Handbuilding?
                        ↓                              ↓
                 Wheelthrowing                   Handbuilding
                        ↓                              ↓
           Check: Do we have 4+ students?      Allocate credits immediately
                 ↓              ↓                      ↓
            YES: Create       NO: Wait            Status: active
            6 classes +       Status: pending    No bookings created
            all bookings
            Status: active
```

#### 2. Draft/Active Class System

**1st Student Enrolls:**
- **DRAFT classes created automatically**
- Bookings created for the student
- Classes visible to admin (marked as DRAFT)
- Status: `draft` in database

**2nd-3rd Student Enrolls:**
- Added to existing DRAFT classes
- Bookings created
- Classes remain DRAFT

**4th Student Enrolls:**
- **Classes automatically ACTIVATED**
- All draft classes updated to `active` status
- Course is now confirmed and live

**5+ Students Enroll:**
- Added to ACTIVE classes
- Classes remain `active`

#### 3. Daily Automatic Check (2:00 AM)

Every day at 2:00 AM, the system:
- Scans all active enrollments without bookings
- Groups them by cohort (same course, date, time, schedule)
- Creates classes for cohorts that meet the threshold
- Creates bookings for all students in those cohorts

**File:** `server/utils/cohortAutoProcessor.js`

#### 4. Manual Trigger

Admins can manually trigger cohort processing:

```bash
# Via script
node server/process-ready-cohorts.js

# Via API
POST /api/admin/process-cohorts
Authorization: Bearer <token>
```

### Threshold Rules

- **Wheelthrowing:** 4+ students required before creating active classes
- **Handbuilding:** No threshold (credit system, immediate allocation)

### Cohort Matching

Students are grouped into cohorts by:
- **Course type:** Wheelthrowing Beginner
- **Start date:** 2026-01-17
- **Day:** SATURDAY
- **Time:** 1:00 PM - 3:30 PM

**Critical:** Time matching ensures 9:30am and 1:00pm Saturday classes are separate cohorts.

### Monitoring

#### Check Auto-Processor Status

Server logs on startup:
```
[Auto-Processor] ✅ Automatic daily processing scheduled (runs at 2:00 AM)
[Auto-Processor] Running initial check...
```

#### Check Pending Enrollments

```sql
SELECT course_type, schedule_pattern, class_time, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'pending'
GROUP BY course_type, schedule_pattern, class_time, course_start_date;
```

#### Check Confirmed Courses

```sql
SELECT course_type, schedule_pattern, class_time, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'confirmed'
GROUP BY course_type, schedule_pattern, class_time, course_start_date;
```

### Key Files

**Webhook System:**
- `server/index.js:4424` - Webhook endpoint `/api/shopify/webhook/orders`
- `server/utils/courseEnrollmentManager.js` - Main webhook logic
- `server/utils/courseScheduler.js` - Course parsing & class generation
- `server/utils/supabaseDb.js` - Database operations

**Auto-Processor:**
- `server/utils/cohortAutoProcessor.js` - Daily cron job
- `server/process-ready-cohorts.js` - Manual trigger script

---

## Authentication System (Magic Link)

### Overview

Passwordless authentication via Supabase Auth magic links. All users (students and admin) sign in by receiving an email link. No passwords stored or managed.

### User Flow

1. User visits `/login` (unified for all users)
2. Enters email, clicks "Send Sign-In Link"
3. Frontend calls `supabase.auth.signInWithOtp({ email })`
4. Supabase sends magic link email via Resend SMTP (`noreply@mail.ves.sg`)
5. User clicks link → redirected to `/auth/callback`
6. `onAuthStateChange` fires → app calls `/api/auth/me` to look up `customers` table
7. Smart redirect: admin → `/admin`, member → `/member`, student → `/gallery`

### Key Components

- `frontend/src/utils/supabase.js` — Supabase client singleton
- `frontend/src/hooks/useAuth.jsx` — Session management, `onAuthStateChange` listener
- `frontend/src/pages/AuthCallback.jsx` — Magic link redirect handler
- `frontend/src/pages/Login.jsx` — Email-only login form
- `server/routes/auth.js` — `/api/auth/me` endpoint, impersonation

### Backend Auth Middleware

`authenticateToken` in `server/index.js` validates Supabase Auth sessions:

```
Authorization header → supabase.auth.getUser(token) → customers table lookup by email → req.user
```

`req.user` shape: `{ customerId, dbCustomerId, email, firstName, lastName, isAdmin }`

Admin is identified by email `info@ves.sg`.

### Email Delivery

- **Provider**: Resend (free tier, 3k emails/month)
- **Domain**: `mail.ves.sg` (DKIM + SPF verified)
- **SMTP**: `smtp.resend.com:465`, configured in Supabase dashboard
- **Template**: Branded HTML with VES logo and terracotta button (saved in Supabase Email Templates > Magic Link)
- **Dashboard**: resend.com/emails for delivery monitoring

---

## Deployment Guide

### Prerequisites

- Node.js 18+ installed
- Vercel account (recommended) or Railway
- Supabase project
- Shopify store with API access

### Backend Deployment (Vercel)

#### 1. Prepare Backend

```bash
cd server
# Ensure package.json has correct start script
# "start": "node index.js"
```

#### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd server
vercel --prod
```

#### 3. Set Environment Variables

In Vercel dashboard, add:

```
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
SHOPIFY_SHOP_DOMAIN=ves-sg.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_token
SUPABASE_URL=https://fpdbfbxpthmaceuspcrf.supabase.co
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_service_key
COOKIE_SECRET=your_cookie_secret
FRONTEND_URL=https://club.ves.sg
NODE_ENV=production
PORT=3000
```

#### 4. Get Backend URL

Vercel provides: `https://server-neon-six.vercel.app`

### Frontend Deployment (Vercel)

#### 1. Update API Base URL

Edit `frontend/src/utils/api.js`:

```javascript
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://server-neon-six.vercel.app'
  : 'http://localhost:3000';
```

#### 2. Build Frontend

```bash
cd frontend
npm run build
```

#### 3. Deploy to Vercel

```bash
cd frontend
vercel --prod
```

#### 4. Update CORS

Update backend `FRONTEND_URL` environment variable to match frontend URL.

### Shopify Webhook Configuration

1. Go to **Settings → Notifications → Webhooks**
2. Add webhook:
   - Event: **Order creation**
   - URL: `https://server-neon-six.vercel.app/api/shopify/webhook/orders`
   - Format: **JSON**
3. Save

### Custom Domain (Optional)

#### Backend: api.pottery.ves.sg
1. Vercel dashboard → Settings → Domains
2. Add: `api.pottery.ves.sg`
3. Update DNS:
   ```
   CNAME api server-neon-six.vercel.app
   ```

#### Frontend: pottery.ves.sg
1. Vercel dashboard → Settings → Domains
2. Add: `pottery.ves.sg`
3. Update DNS:
   ```
   CNAME pottery your-frontend.vercel.app
   ```

### Production URLs

- **Frontend**: https://club.ves.sg (Vercel)
- **Backend**: https://ves-pottery-api-production.up.railway.app (Railway)
- **Database**: Supabase project `fpdbfbxpthmaceuspcrf`

### Post-Deployment Checklist

- [ ] Test magic link login (admin and student)
- [ ] Test class calendar display
- [ ] Test enrollment creation via Shopify order
- [ ] Test webhook is receiving orders
- [ ] Test HB classes are visible
- [ ] Check Resend dashboard for email delivery
- [ ] Monitor Railway logs for errors
- [ ] Check auto-processor is running (2am logs)

---

## API Reference

### Authentication Endpoints

Authentication uses Supabase Auth tokens. The frontend obtains tokens via `supabase.auth.signInWithOtp()` and sends them in the `Authorization: Bearer <supabase_access_token>` header.

#### GET `/api/auth/me`
Get current user info (looks up `customers` table by Supabase auth email)

**Headers:** `Authorization: Bearer <supabase_access_token>`

**Response:**
```json
{
  "id": "123456789",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### POST `/api/auth/logout`
Logout (clears cookie)

#### POST `/api/auth/register`
**DISABLED** - Returns 403

### Gallery Endpoints

#### GET `/api/pottery/pieces`
Get pottery pieces for logged-in user

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
[
  {
    "id": "piece_001",
    "title": "Ceramic Bowl",
    "images": ["https://cdn.shopify.com/..."],
    "date_completed": "2024-10-01",
    "clay_type": "Stoneware",
    "glazes": ["Celadon"],
    "dimensions": { "height": "25 cm" },
    "tags": ["wheel-thrown"]
  }
]
```

### Admin Endpoints

#### GET `/api/admin/customers`
Get all customers

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
[
  {
    "id": 123,
    "email": "student@example.com",
    "first_name": "John",
    "last_name": "Doe"
  }
]
```

#### GET `/api/admin/customers/:customerId/pieces`
Get pieces for specific customer

#### POST `/api/admin/customers/:customerId/pieces`
Update pieces for specific customer

**Request:**
```json
{
  "pieces": [...]
}
```

#### DELETE `/api/admin/bookings/:bookingId`
Delete a student booking (NEW - Jan 2026)

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Booking deleted successfully"
}
```

**Used by:** Admin Student Detail page to remove individual bookings

#### GET `/api/admin/classes`
Get all classes with enrollments (uses pagination for bookings)

**Query Parameters:**
- `classTypeFilter` - Filter by class type
- `startDate` - Filter by start date
- `endDate` - Filter by end date

**Response:**
```json
{
  "courses": [
    {
      "identifier": "WT1210AM_DL6",
      "classes": [...],
      "totalEnrollment": 7
    }
  ]
}
```

#### POST `/api/admin/classes`
Create a new class

**Request:**
```json
{
  "class_date": "2026-01-20",
  "start_time": "9:30 AM",
  "end_time": "12:00 PM",
  "class_type": "Wheelthrowing Beginner",
  "instructor": "Dillon Lin",
  "room": "Main Studio",
  "max_capacity": 8
}
```

#### DELETE `/api/admin/classes/:classId`
Delete a class (only if no enrolled students)

#### POST `/api/admin/process-cohorts`
Manually trigger cohort processing

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "processed": 3,
  "skipped": 2,
  "errors": 0
}
```

### Webhook Endpoints

#### POST `/api/shopify/webhook/orders`
Shopify order creation webhook

**Headers:**
- `X-Shopify-Hmac-SHA256` - Shopify signature
- `Content-Type: application/json`

**Request:** Shopify order JSON

**Response:**
```json
{
  "success": true,
  "message": "Order processed successfully"
}
```

### Utility Endpoints

#### GET `/health`
Health check

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-11T10:00:00.000Z"
}
```

---

## Troubleshooting

### Common Issues

#### HB Classes Not Showing

**Symptoms:** No Wednesday classes in calendar

**Solution:**
```bash
node server/check-hb-classes.js  # Should show 68 classes
node server/create-hb-classes.js # If 0 classes found
```

#### Enrollment Counts Wrong

**Symptoms:** Shows "1/8" when actually "7/8"

**Root Cause:** Not using pagination to fetch all bookings

**Solution:** Check `server/index.js` lines 2047-2071 for pagination implementation

**Verify:** Server logs should show "Fetched 1143 bookings" (not 1000)

#### Classes Not Auto-Creating

**Symptoms:** 4+ students enrolled but no classes created

**Check:**
1. Server logs for "[Auto-Processor]" messages
2. Webhook is configured in Shopify
3. Enrollment status:
   ```sql
   SELECT * FROM course_enrollments WHERE status = 'pending';
   ```

**Manual Trigger:**
```bash
node server/process-ready-cohorts.js
```

#### Calendar Not Highlighting

**Symptoms:** Classes don't show orange by default

**Root Cause:** `getClassCategory()` returning "other" instead of "wheelthrowing-beginner"

**Solution:** Check `AdminClasses.jsx` line 60-76:
- Must check `classType.toUpperCase().startsWith('WT')` for wheelthrowing
- Database stores `class_type` as "WT1210AM_DL6.4", NOT "Wheelthrowing Beginner Week 4"

#### Login Failed

**Check:**
1. Backend server is running on port 3000
2. Customer email exists in `customers` table
3. Magic link email arrived (check spam/Resend dashboard)
4. Supabase URL config has correct redirect URLs
5. Check browser console for errors

#### Port 3000 Already in Use

**Solution:**
```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

#### Images Not Loading

**Causes:**
1. Image URL is incorrect or expired
2. CORS issues with Shopify CDN
3. Image field was left empty

**Solution:** Upload image to Shopify Files and copy CDN URL

#### Webhook Not Receiving Events

**Check:**
1. Verify webhook URL in Shopify admin
2. Server is deployed and accessible
3. Test with: `curl https://server-neon-six.vercel.app/health`

### Debug Commands

```bash
# Check HB classes
node server/check-hb-classes.js

# Check recent orders
node server/check-recent-orders.js

# Check enrollments
node server/check-recent-enrollments.js

# Verify credit system
node server/setup-handbuilding-system.js

# Process pending cohorts
node server/process-ready-cohorts.js
```

### Database Queries

**Check pending cohorts:**
```sql
SELECT course_type, schedule_pattern, class_time, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'pending'
GROUP BY course_type, schedule_pattern, class_time, course_start_date
HAVING COUNT(*) >= 4;
```

**Check active classes:**
```sql
SELECT class_date, start_time, class_type, current_enrollment, max_capacity, status
FROM class_instances
WHERE class_date >= CURRENT_DATE
ORDER BY class_date, start_time;
```

**Check booking counts:**
```sql
SELECT COUNT(*) FROM bookings WHERE status IN ('booked', 'completed');
```

**Check HB credits:**
```sql
SELECT student_id, class_credits_allocated, class_credits_used, class_credits_remaining
FROM course_enrollments
WHERE course_type = 'handbuilding';
```

### Log Monitoring

**Backend logs (development):**
```bash
cd server
npm run dev
# Watch for errors, webhook calls, auto-processor messages
```

**Backend logs (production - Vercel):**
```bash
vercel logs
# Or check Vercel dashboard
```

**Frontend logs:**
- Open browser console (F12)
- Check Network tab for failed API calls
- Check Console tab for errors

---

## Key Differences: WT vs HB

| Feature | Wheelthrowing (WT) | Handbuilding (HB) |
|---------|-------------------|-------------------|
| **Class Creation** | Auto-creates when cohort forms | **Must pre-create with script** |
| **Format** | `WT1210AM_DL6.1` (with week #) | `HB_170925_LT` (date-based) |
| **Booking** | Auto-books all 6/7 weeks | Student self-registers |
| **Schedule** | Fixed consecutive weeks | Flexible, can skip weeks |
| **Threshold** | 4 students to activate | No threshold (draft created immediately) |
| **Credits** | N/A | 4 or 8 credits, never expire |
| **Capacity** | 8 teaching + 2 makeup | 12 students |
| **Glazing Access** | Part of course (week 6) | Can use 1 credit (if not used) |

---

## Recent Changes

**2026-01-12:**
- **Added Admin Booking Deletion:** Delete button in student detail page for removing individual bookings
- **Implemented 24-Hour Reschedule Cutoff:** Students cannot reschedule within 24 hours of class start
- **Added Cohort Restrictions:** 6-week WT students must reschedule within cohort dates (Jan 17 - Mar 3)
- **Glazing Class Exception:** Week 6 glazing can reschedule to any future glazing class regardless of cohort
- **10-Class Package Support:** WT 10-class package has no cohort restrictions but 10th class must be glazing
- **Enhanced Reschedule Validation:** Both frontend and backend enforce all reschedule rules
- **Created vercel.json:** Fixed Vercel deployment configuration for frontend build
- **Technical Implementation:**
  - `frontend/src/pages/AdminStudentDetail.jsx`: Delete booking functionality
  - `server/index.js` lines 1663-1798: Comprehensive reschedule validation logic
  - `frontend/src/pages/ClassScheduleNew.jsx`: 24-hour cutoff and cohort filtering

**2026-01-11:**
- Combined all documentation into single comprehensive file
- Removed duplicate content across multiple MD files
- Organized by topic for easier navigation
- Updated troubleshooting section with common issues
- Added complete API reference
- Consolidated setup instructions

**2025-12-28:**
- Created 68 HB classes from Sept 2025 to Dec 2026
- Updated documentation to emphasize HB classes must be pre-created
- Created SYSTEM_RULES.md as master reference
- Updated CLASS_SCHEDULE_RULES.md with current HB format
- Updated HANDBUILDING_CREDIT_SYSTEM.md with critical setup warning

**2025-11-15:**
- Fixed enrollment counting with pagination (1143 bookings)
- Fixed course highlighting to show light orange by default
- Fixed `getClassCategory()` to check for "WT" prefix

---

## Support and Documentation Files

### Primary Reference Files

- **`COMPLETE_DOCUMENTATION.md`** - This file (master reference)
- **`SYSTEM_RULES.md`** - Quick reference for system rules
- **`CLASS_SCHEDULE_RULES.md`** - Class format, naming, schedule rules

### Specialized Documentation

- **`CALENDAR_AND_ENROLLMENT_SYSTEM.md`** - Calendar implementation details
- **`HANDBUILDING_CREDIT_SYSTEM.md`** - Complete HB system guide
- **`EMAIL_VERIFICATION_SYSTEM.md`** - Email verification flow
- **`DEPLOYMENT.md`** - Detailed deployment instructions
- **`WEBHOOK_SETUP.md`** - Webhook configuration

### Database Documentation

- **`server/verification-table.sql`** - Email verification table schema
- **`server/migrations/add-credit-system.sql`** - Credit system migration

### Shopify Admin Access

- **Store:** https://admin.shopify.com/store/ves-sg
- **Public Domain:** https://ves.sg
- **Admin Domain:** https://ves-sg.myshopify.com

### Key Code Files

- **Server:** `/Users/justinlong/pottery-gallery-app/server/index.js`
- **Admin UI:** `/Users/justinlong/pottery-gallery-app/frontend/src/pages/AdminClasses.jsx`
- **Calendar:** `/Users/justinlong/pottery-gallery-app/frontend/src/components/ClassCalendar.jsx`
- **Course Scheduler:** `/Users/justinlong/pottery-gallery-app/server/utils/courseScheduler.js`
- **Enrollment Manager:** `/Users/justinlong/pottery-gallery-app/server/utils/courseEnrollmentManager.js`

---

**For additional help, refer to the specialized documentation files listed above or check the code comments in key files.**
