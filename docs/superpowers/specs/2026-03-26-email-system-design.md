# Email System & Studio Policies — Design Spec

**Date:** 2026-03-26
**Status:** Draft

## Overview

Add transactional email capability to VES Clay Club using Resend (already configured on mail.ves.sg). Three email flows: course details emails (admin-drafted, reviewed, then sent), cohort confirmed emails (auto-sent when 4-student threshold met), and kids course auto-outreach (auto-sent on purchase). Plus a first-login policy agreement popup and permanent policies page.

## 1. Email Infrastructure

### 1.1 Resend SDK Integration

- Add `resend` npm package to `server/`
- New `server/utils/emailService.js`:
  - Wraps Resend SDK
  - `sendEmail({ to, bcc, subject, html })` — sends via Resend
  - `sendCourseEmail({ courseId, subject, html, bccList })` — sends + logs to `sent_emails`
  - From address: `VES Studio <info@ves.sg>` via mail.ves.sg domain
  - Error handling: retries once, logs failures

### 1.2 `sent_emails` Database Table

```sql
CREATE TABLE sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type TEXT NOT NULL,          -- 'course_details', 'cohort_confirmed', 'kids_outreach'
  course_enrollment_id UUID,          -- nullable, FK to course_enrollments
  course_identifier TEXT,             -- e.g. 'WT0503NT_JL6'
  subject TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  recipient_emails TEXT[],            -- array of BCC'd emails
  sent_by TEXT,                       -- admin email or 'system'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_message_id TEXT              -- Resend API response ID
);
```

### 1.3 Email Template Base

Reuse the magic-link.html design language:
- Background: `#F5F3F0`
- Card: white, `border-radius: 12px`, `max-width: 560px` (wider than magic-link for more content)
- VES logo at top
- Terracotta accent: `#C4622D` for buttons/highlights
- Text: `#282828` body, `#888888` muted
- Footer: "VES Clay Studio · 75 Jalan Kelabu Asap, Singapore 278268"

All templates are JS functions in `server/email-templates/` that return `{ subject, html }`.

## 2. Course Detail Email Templates

### 2.1 Template Structure

Each course type has a template module in `server/email-templates/courses/`:

```
server/email-templates/
  base.js              -- shared HTML wrapper (header, footer, styles)
  cohort-confirmed.js  -- threshold-met notification
  courses/
    wt-6week.js        -- 6-week Beginner/Extension Wheelthrowing
    wt-10class.js      -- 10-class Wheelthrowing
    wt-3x6week.js      -- 3x6-week Wheelthrowing Package
    wt-7week-inter.js  -- 7-week Intermediate Wheelthrowing
    hb-8credit.js      -- Handbuilding 8-credit
    kids-clay.js       -- Kids Let's Play with Clay
```

### 2.2 Template Function Signature

Each template exports:

```javascript
module.exports = function generateCourseEmail({
  courseDates,         // array of { date, startTime, endTime }
  holidayExclusions,   // string, e.g. "NO CLASS 18 APR GOOD FRIDAY"
  collectionStartDate, // auto-calculated: 1 month after last class
  collectionEndDate,   // auto-calculated: 3 months after last class
  specialNotes,        // admin-added free text
}) {
  return { subject, html };
}
```

### 2.3 Dynamic Fields Per Template

**Common to all:**
- Course dates & times (from class_instances)
- Holiday exclusions (admin-editable, blank by default)
- Studio address + Google Maps link
- Link to policies page: `https://club.ves.sg/policies`
- Collection start date (1 month after last class)
- Disposal date (3 months after last class)

**Per course type — different content for:**
- Course description
- Course fees included
- Number of pieces (e.g., 7 for 6-week WT)
- Class size limits
- Makeup policy specifics
- Items required (tools pricing, etc.)
- Subject line format

### 2.4 Subject Line Format

`VES Course Details: [Course Type] — [Day], [Start Date] - [End Date] ([Time])`

Example: `VES Course Details: 6-Week Beginner Wheelthrowing — Fridays, 14 Mar - 25 Apr (9:30am - 12:00pm)`

## 3. Cohort Confirmed Email

Triggered automatically in `courseEnrollmentManager.js` when `checkAndProcessThreshold()` succeeds (4+ students).

**Content:**
- "Your wheelthrowing class is confirmed!"
- Course dates, timeslot, location
- "You'll receive detailed course information closer to your start date"
- Link to club.ves.sg to manage bookings
- Simple, short — not the full course details

**Recipients:** All students in the newly-formed cohort (BCC).

## 4. Admin Panel — Course Emails Page

### 4.1 Course Email List View

New route: `/admin/course-emails` (or tab within existing admin)

**Shows:**
- Courses starting within the next 14 days
- Columns: Course Type | Start Date | Timeslot | Students | Email Status
- Email status: `not_sent` (grey), `draft_ready` (yellow), `sent` (green with date)
- "Compose" button for each unsent course

### 4.2 Draft Editor View

When admin clicks "Compose" on a course:

1. **Auto-populates** from template + DB data:
   - Course type detected → loads correct template
   - Dates pulled from `class_instances` for that course identifier
   - Student list from `bookings` + `customers` join
   - Collection date auto-calculated (editable)
   - Disposal date auto-calculated (editable)

2. **Editable fields:**
   - Holiday exclusions (text input, blank by default)
   - Special notes (textarea, blank by default)
   - Collection start date (date picker, default: last class + 1 month)
   - Disposal date (date picker, default: last class + 3 months)

3. **Student list:**
   - Shows all enrolled students with email, checkboxes (all selected by default)
   - Admin can uncheck individuals to exclude

4. **Actions:**
   - "Preview" — renders full HTML email in a modal
   - "Send" — confirmation dialog: "Send course details to X students?" → sends via Resend, logs to `sent_emails`

### 4.3 Backend Endpoints

```
GET  /api/admin/course-emails            -- list upcoming courses + email status
GET  /api/admin/course-emails/:courseId/draft  -- generate draft from template
POST /api/admin/course-emails/:courseId/send   -- send email, log to sent_emails
GET  /api/admin/course-emails/history     -- sent email log
```

## 5. Five-Day Reminder Cron

- Daily cron job (runs alongside existing 2AM attendance cron)
- Checks for courses starting in 5 days where `sent_emails` has no `course_details` entry
- Sends a nudge email to `info@ves.sg`: "Course email reminder: [Course Type] starting [Date] — [X] students enrolled, email not yet sent. Review draft at club.ves.sg/admin/course-emails"

## 6. First-Login Policy Popup

### 6.1 Database

Add column to `customers`:

```sql
ALTER TABLE customers ADD COLUMN policies_accepted_at TIMESTAMPTZ;
```

### 6.2 Backend

- `GET /api/user/profile` (or existing auth endpoint) returns `policies_accepted_at`
- `POST /api/user/accept-policies` — sets `policies_accepted_at = NOW()` for authenticated user

### 6.3 Frontend — Policy Popup

On login, if `policies_accepted_at` is null:
- Full-screen modal overlay (cannot dismiss, no X button)
- VES logo at top
- Scrollable policy text covering:
  - Class size and policies (non-refundable, transfer rules)
  - Makeup class policy
  - Punctuality expectations
  - Items required
  - Studio rules (cleanup, initials, masks, clothing, nails, food, age)
  - Collection & disposal policy
  - Right to ban clause
- Checkbox: "I have read and agree to the studio policies"
- "Continue" button (disabled until checkbox checked)
- On submit: calls `POST /api/user/accept-policies`, then proceeds to dashboard

### 6.4 Frontend — Policies Page

- Route: `/policies`
- Public (no auth required) — so email links work
- Same content as the popup, but as a normal page with VES branding
- Accessible from footer navigation on all pages

## 7. Kids Course Auto-Outreach

### 7.1 Trigger

When Shopify order webhook processes a kids course purchase (detected by product title containing "Kids" or "Let's Play with Clay"), auto-send outreach email immediately — no admin review needed.

### 7.2 Email Content

- From: `VES Studio <info@ves.sg>`
- To: parent's email (from Shopify order)
- Subject: `VES — Let's Play with Clay: Let's Arrange Your Class!`
- Body:
  - Thank you for purchasing Let's Play with Clay
  - "Please reply to this email to arrange your preferred date and time"
  - Studio address + map link
  - Link to policies page on club.ves.sg
  - VES branded template (same base as other emails)
- Logged to `sent_emails` with `email_type: 'kids_outreach'`

### 7.3 Admin Workflow After

- Parent replies to info@ves.sg → admin arranges date via normal email
- Admin creates class instance + booking manually in admin panel
- No further automated emails for kids courses

## 8. Course Type Detection (includes Kids)

The system needs to map enrollments to the correct email template. Logic in `server/utils/emailService.js`:

```javascript
function detectCourseTemplate(enrollment) {
  const { course_type, number_of_weeks, course_identifier } = enrollment;

  if (course_identifier?.includes('KIDS')) return 'kids-clay';
  if (course_type === 'handbuilding') return 'hb-8credit';
  if (number_of_weeks === 10) return 'wt-10class';
  if (number_of_weeks >= 18) return 'wt-3x6week';  // 3x6 = 18 weeks
  if (number_of_weeks === 7) return 'wt-7week-inter';
  return 'wt-6week';  // default: 6-week beginner/extension
}
```

This will need validation against actual enrollment data to confirm the detection logic is accurate.

## 9. Out of Scope

- Booking confirmation emails (Shopify handles)
- Piece tracking / collection notifications (future feature)
- Fully automated course email sending (phase 2 — remove admin review step)
- Rich text editor for templates (templates in code, editable fields are plain text)
- Email analytics/open tracking
- Kids course date picker / self-service scheduling (future — currently manual via email reply)
