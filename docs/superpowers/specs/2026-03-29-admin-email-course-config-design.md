# Admin Email Management & Course Configuration

**Date:** 2026-03-29
**Status:** Approved

## Overview

Two new admin features behind a settings gear icon in the admin nav:

1. **Emails** (`/admin/emails`) — Manage course email settings (auto-send vs manual), compose and send emails, view send history with per-student logging
2. **Courses** (`/admin/courses`) — Configure per-course-type business rules (max pax, makeup limits, fees, etc.) currently hardcoded across ~10 files

## Navigation

A gear icon appears to the left of the Sync button in AdminNav. Clicking opens a dropdown with two links: **Emails** and **Courses**. Clicking outside or navigating closes it. The three everyday nav items (Classes, Users, Studio) remain unchanged.

## Database

### New table: `course_config`

One row per course type. All configurable business rules live here.

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `id` | uuid | auto | PK |
| `course_type_key` | text (unique) | `wt-6week` | Lookup key |
| `display_name` | text | `Wheelthrowing 6-Week` | Shown in admin UI |
| `category` | text | `wheelthrowing` / `handbuilding` | Used for flow logic |
| `number_of_weeks` | int | 6 | Class count |
| `max_capacity` | int | 10 | Per class instance |
| `min_students_to_activate` | int | 4 | Threshold to confirm course |
| `max_makeups` | int | 3 | Per enrollment |
| `makeup_fee` | numeric | 40.00 | Outside-cohort makeup |
| `noshow_fee` | numeric | 20.00 | Missed rescheduled class |
| `reschedule_notice_hours` | int | 24 | Advance notice required |
| `finished_pieces` | int | 7 | Pieces included |
| `clay_weight_limit_g` | int | null | HB only (e.g., 3000) |
| `additional_piece_fee` | numeric | 20.00 | Per extra piece |
| `email_auto_send` | boolean | false | Auto-send on trigger |
| `email_send_days_before` | int | 5 | Days before start to auto-send (WT) |
| `email_template_key` | text | `wt-6week` | Maps to template file |
| `created_at` | timestamptz | auto | |
| `updated_at` | timestamptz | auto | |

### Seed data

Pre-populated with current hardcoded values for all existing course types:

- `wt-6week` — Wheelthrowing 6-Week (manual send, 5 days before)
- `wt-7week-inter` — Wheelthrowing 7-Week Intermediate (manual send, 5 days before)
- `wt-10class` — Wheelthrowing 10-Class Package (manual send, 5 days before)
- `wt-3x6week` — Wheelthrowing 3-Course Package (manual send, 5 days before)
- `hb-4credit` — Handbuilding 4-Credit (auto-send on purchase)
- `hb-8credit` — Handbuilding 8-Credit (auto-send on purchase)

## Feature 1: Courses Config Page (`/admin/courses`)

### UI

A table with one row per course type. Each cell is inline-editable (click to edit, blur to save). Columns:

| Course | Weeks | Max Pax | Min to Activate | Makeups | Makeup Fee | No-show Fee | Notice (hrs) | Pieces | Weight (g) | Add'l Piece Fee |
|--------|-------|---------|-----------------|---------|------------|-------------|--------------|--------|------------|-----------------|

- Click any cell to edit, auto-saves on blur
- "+" button at bottom to add a new course type
- Changes write to `course_config` table immediately via `PUT /api/admin/course-config/:key`
- Weight column only shown/editable for HB courses

### Backend

- `GET /api/admin/course-config` — returns all rows
- `PUT /api/admin/course-config/:key` — update one course type
- `POST /api/admin/course-config` — create new course type

### Refactoring

All files currently reading hardcoded values get refactored to read from `course_config`:

| File | Current Hardcoded Values |
|------|------------------------|
| `server/utils/courseEnrollmentManager.js` | `MINIMUM_STUDENTS_THRESHOLD = 4`, `maxCapacity: 10` |
| `server/utils/courseScheduler.js` | `maxCapacity: 10`, room defaults |
| `server/utils/cohortAutoProcessor.js` | 5-day reminder timing, 4-student threshold |
| `frontend/src/utils/courseDetails.js` | Pieces, fees, makeup limits, weight limits in text descriptions |

Config is cached in memory on server start and refreshed on any admin update (no DB query per request).

## Feature 2: Emails Page (`/admin/emails`)

### Email Flow Logic

**Handbuilding (auto-send on purchase):**
1. Customer purchases HB package on Shopify
2. Order webhook fires → enrollment created
3. Email auto-sent immediately with course details
4. Student can immediately book classes
5. Send logged per student in `sent_emails`

**Wheelthrowing (configurable timing):**
1. Students enroll via Shopify purchase
2. At X days before course start (default 5), auto-processor checks enrollment count:
   - **4+ pax enrolled** → course confirmed → send confirmation email with class details, schedule, dates
   - **Less than 4 pax** → course not confirmed → send unconfirmed/postponement email
3. Each student gets their own personalized email ("Dear Sarah,")
4. Content (schedule, policies, dates) is the same for all students in a course
5. Every send logged per student in `sent_emails`
6. Late enrollments (after bulk send) show as "not sent" — admin can manually trigger for them

**Wheelthrowing unconfirmed → weekly recheck loop:**
If a course doesn't reach minimum pax by the initial send date:
1. Unconfirmed/postponement email sent to all enrolled students
2. Auto-processor rechecks every 7 days (on the daily 2 AM run, checks if 7 days since last unconfirmed email)
3. If still below minimum pax → resend unconfirmed email to all enrolled students (including any new enrollments since last send)
4. As soon as minimum pax is reached → automatically send the confirmation email with full class details
5. Weekly recheck stops once confirmation email is sent
6. All sends (unconfirmed repeats + final confirmation) logged per student in `sent_emails`

**Admin override:** Regardless of auto-send setting, admin can always manually compose and send from the Emails page.

### UI — Two Sections

**Top: Course Email Settings Table**

| Course | Auto-send | Days Before | Template | Last Sent |
|--------|-----------|-------------|----------|-----------|
| WT 6-Week | ☐ | 5 | wt-6week | 2026-03-20 |
| HB 4-Credit | ☑ | — (on purchase) | hb-4credit | 2026-03-28 |

- Checkbox toggles `email_auto_send` in `course_config`
- "Days Before" editable when auto-send is ON and category is wheelthrowing
- HB auto-send shows "on purchase" instead of days (fires on Shopify order, not timer)
- Last Sent pulled from `sent_emails` table

**Bottom: Compose & History**

Carries forward the existing AdminCourseEmails functionality:

- Lists upcoming courses that need manual emails (only courses where `email_auto_send = false` OR where admin wants to override)
- Compose draft with pre-filled course data (schedule, dates, student list)
- Editable fields: holiday exclusions, special notes, collection/disposal dates
- Select recipients (checkboxes per student, all selected by default)
- Send and log per student
- History view: who received what, when, with filter by course

### Per-Student Logging

The `sent_emails` table already exists. Each email send creates one record per student:

- `email_type`: `course_details` or `course_unconfirmed`
- `course_identifier`: base course ID
- `recipient_email`: individual student email
- `recipient_name`: student name (for the "Dear X" personalization)
- `sent_by`: `system` (auto) or admin email (manual)
- `sent_at`: timestamp

This allows the admin to see exactly who has and hasn't received emails for any given course.

### Backend

- Existing endpoints in `admin.js` (lines 4227-4480) stay, updated to read from `course_config`
- Auto-processor `checkCourseEmailReminders()` reads `email_send_days_before` from config
- Auto-processor `checkUnconfirmedCourses()` reads `min_students_to_activate` from config
- New endpoint: `PUT /api/admin/course-config/:key` handles email settings updates (shared with Courses page)

## Files to Create

| File | Purpose |
|------|---------|
| `server/migrations/course_config.sql` | Create table + seed data |
| `server/utils/courseConfig.js` | Config cache, load, refresh |
| `frontend/src/pages/AdminCourseConfig.jsx` | Courses config page |
| `frontend/src/pages/AdminEmails.jsx` | Emails management page (replaces old AdminCourseEmails) |

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/AdminNav.jsx` | Add gear icon dropdown with Emails/Courses links |
| `frontend/src/App.jsx` | Add routes for `/admin/emails` and `/admin/courses` |
| `server/routes/admin.js` | Add CRUD endpoints for `course_config` |
| `server/utils/courseEnrollmentManager.js` | Read from config instead of hardcoded constants |
| `server/utils/courseScheduler.js` | Read max capacity from config |
| `server/utils/cohortAutoProcessor.js` | Read timing + thresholds from config |
| `server/routes/shopify.js` | Check `email_auto_send` from config before sending HB emails |
| `frontend/src/utils/courseDetails.js` | Generate descriptions from config values instead of hardcoded text |
