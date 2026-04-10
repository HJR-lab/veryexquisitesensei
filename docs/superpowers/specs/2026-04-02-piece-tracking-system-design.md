# Piece Tracking & Collection System — Design Spec

**Date:** 2026-04-02
**Status:** Draft

## Problem

Students make pottery pieces inscribed with 3-letter/number initials, but there's no system to:
- Track pieces through the firing pipeline (drying → bisque → glaze → ready)
- Notify students when their pieces are ready for collection
- Let students choose collection or delivery
- Help staff identify whose pieces are whose after firing

Students currently email the studio asking to come collect — they have no visibility into whether pieces are ready.

## Solution

A batch-based piece tracking system tied to course enrollments. Students photograph all their pieces together (one photo per course batch), staff updates status through the firing lifecycle, and the system automatically notifies students when pieces are ready with collect/deliver options.

## Core Model

**1 course enrollment = 1 piece batch = 1 photo**

Each course has a known piece allowance from `course_config.finished_pieces`:

| Course | Pieces Included | Extra Piece Fee |
|--------|----------------|-----------------|
| WT 6-Week | 7 | $20 |
| WT 7-Week Inter | 8 | $20 |
| WT 10-Class | 11 | $20 |
| WT 3-Course Pkg | 21 | $20 |
| HB 4-Credit | 5 | $20 |
| HB 8-Credit | 9 | $20 |

## Piece Lifecycle

```
Logged → Bisque Fired → Glaze Fired → Ready → Collected/Shipped
  ↑           ↑              ↑           ↑            ↑
student    staff           staff      staff +      staff
submits    updates         updates    auto-email   confirms
photo
```

### Statuses

| Status | Set By | Description |
|--------|--------|-------------|
| `logged` | Student | Photo submitted, pieces awaiting first fire |
| `bisque_fired` | Staff | First firing complete, ready for glazing |
| `glaze_fired` | Staff | Second firing complete, cooling |
| `ready` | Staff | Pieces ready — triggers notification email to student |
| `collecting` | Student | Student chose to collect in studio |
| `delivering` | Student | Student chose delivery ($10) |
| `collected` | Staff | Student picked up pieces — done |
| `shipped` | Staff | Pieces shipped to student — done |
| `recycled` | Staff | Uncollected after 60-day hold — recycled |

## Student Experience

### Logging Pieces

- Accessed from a new "My Pieces" section (in Gallery page or standalone)
- Shows each course enrollment with piece tracking status
- "Log My Pieces" button for enrollments that haven't been logged yet
- Logging form:
  - **Photo** (required) — one photo of all pieces together, showing shapes and initials
  - **Piece count** (required) — number stepper, shows allowance ("5 included")
  - **Initials** (required) — pre-filled from student profile, editable
  - **Notes** (optional) — e.g. "3 bowls, 2 mugs"
- If piece count exceeds `finished_pieces`, display "$20 per extra piece" note
- Students can update photo or add additional photos at any point
- Preferred timing: after glazing, before glaze fire — but flexible

### Tracking Status

- Each course batch shows current status with color-coded badge:
  - Grey: Logged / Drying
  - Orange: Bisque Fired / Glaze Firing
  - Green: Ready
- When status is "Ready", collect/deliver buttons appear:
  - **"I'll Collect"** — marks as `collecting`, no fee
  - **"Deliver to Me ($10)"** — marks as `delivering`, $10 fee for packing & shipping

### Student Profile Addition

- New `initials` field on customer profile
- Students set once, auto-fills on every piece submission
- Editable per-batch if they use different initials

## Staff / Admin Experience

### Pipeline Dashboard

New admin page showing all active piece batches:
- Summary cards: count of batches per status (Drying / Bisque / Glaze Fire / Ready)
- Total piece count across all batches
- Batch list grouped by status, each showing:
  - Student name
  - Course type
  - Piece count
  - Initials
  - Days since last status change
  - "Mark Ready" / "Complete" action buttons
- Warning flags:
  - "⚠️ No response" — ready for 7+ days, student hasn't chosen collect/deliver
  - "⚠️ Expiring" — approaching 60-day hold deadline

### Identify a Piece (Search)

Primary method — always available:
- Text search by initials
- Returns matching students with their batch photo, course, piece count
- Staff visually confirms by comparing the physical piece to the batch photo

### Identify a Piece (AI Match — Optional)

Secondary method — disabled by default, togglable in settings:
- Staff photographs the inscription on a piece's bottom
- OpenAI Vision API reads the inscribed initials
- System suggests matching student(s)
- Staff confirms/rejects the match
- Cost: ~$0.01-0.02 per scan
- Falls back to manual search if AI can't read inscription

### Status Updates

- Staff can update batch status: Logged → Bisque Fired → Glaze Fired → Ready
- "Mark Ready" triggers automatic notification email
- "Complete" (Collected/Shipped) moves batch to history
- Bulk actions: select multiple batches, apply same status (useful after a kiln load finishes)

## Notification System

### "Ready for Collection" Email

Triggered automatically when staff marks a batch as "Ready":

- **Subject:** "Your pottery is ready! 🏺"
- **Content:**
  - Student name
  - Course name and dates
  - Piece count
  - Batch photo (from student's submission)
  - Two CTA buttons: "I'll Collect" / "Deliver to Me ($10)"
  - Links back to the app
- **Sent via:** Existing Resend email system (mail.ves.sg)

### Reminder Emails

- **Frequency:** Every 2 weeks after "Ready" status
- **Hold period:** 60 days from ready date
- **Schedule:** Reminders at day 14, 28, 42, 56
- **Final reminder (day 56):** Warns that pieces will be recycled in 4 days
- **After 60 days:** Staff can mark as `recycled`

### Delivery Coordination

When student chooses delivery:
- Staff sees "Delivery" flag on the batch in pipeline dashboard
- Staff handles packing, shipping, and marks as `shipped` when done
- $10 delivery fee tracking (recorded on the batch record)

## Data Model

### New Table: `piece_batches`

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `course_enrollment_id` | integer | FK to `course_enrollments` |
| `customer_id` | integer | FK to `customers` |
| `status` | text | Current lifecycle status |
| `piece_count` | integer | Number of pieces in batch |
| `initials` | text | Inscribed initials (e.g. "JL") |
| `notes` | text | Optional description |
| `photo_urls` | jsonb | Array of photo URLs |
| `delivery_method` | text | null / `collect` / `deliver` |
| `delivery_fee` | numeric | 0 or 10.00 |
| `ready_at` | timestamptz | When marked ready (for hold calculation) |
| `hold_expires_at` | timestamptz | ready_at + 60 days |
| `last_reminder_at` | timestamptz | Last reminder email sent |
| `completed_at` | timestamptz | When collected/shipped |
| `created_at` | timestamptz | When student logged pieces |
| `updated_at` | timestamptz | Last status change |

### Customer Profile Addition

| Column | Type | Description |
|--------|------|-------------|
| `initials` | text | Student's default inscription initials |

### Relationship to Existing Tables

- `piece_batches.course_enrollment_id` → `course_enrollments.id` (1:1)
- `piece_batches.customer_id` → `customers.id` (1:many — student can have multiple batches across courses)
- Piece allowance derived from `course_config.finished_pieces` via enrollment's course type
- Photos stored in Supabase Storage under `customers/{customerId}/pieces/`

### Existing `pottery_pieces` Table

The existing `pottery_pieces` table remains as-is for the gallery/portfolio feature. `piece_batches` is a separate concern (tracking through firing pipeline). A student may optionally create individual `pottery_pieces` gallery entries from their batch after collection, but this is not required and can be a future enhancement.

## API Endpoints

### Student Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/pieces/my-batches` | List student's piece batches with status |
| `POST` | `/api/pieces/log` | Log a new batch (photo, count, initials, enrollment_id) |
| `PUT` | `/api/pieces/batches/:id` | Update batch (add photos, change count/notes) |
| `PUT` | `/api/pieces/batches/:id/delivery` | Set delivery method (collect/deliver) |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/pieces/pipeline` | Get all active batches grouped by status |
| `GET` | `/api/admin/pieces/search?initials=XX` | Search batches by initials |
| `PUT` | `/api/admin/pieces/batches/:id/status` | Update batch status |
| `PUT` | `/api/admin/pieces/batches/:batchId/complete` | Mark as collected/shipped |
| `POST` | `/api/admin/pieces/identify` | AI inscription match (optional, sends photo) |
| `POST` | `/api/admin/pieces/bulk-status` | Bulk status update for multiple batches |

## Email Templates

### Ready Notification (`pieces-ready.js`)

Sent when status → `ready`. Contains batch photo, piece count, course name, collect/deliver CTAs.

### Reminder (`pieces-reminder.js`)

Sent every 2 weeks. Same content as ready notification with urgency increasing:
- Day 14: "Just a reminder — your pieces are waiting!"
- Day 28: "Your pottery is still here"
- Day 42: "Don't forget your pieces"
- Day 56: "Last chance — pieces will be recycled in 4 days"

## Automated Jobs

### Reminder Cron

- Runs daily
- Checks all batches with status `ready` where `delivery_method` is null or pieces not yet collected
- Sends reminder if `last_reminder_at` is 14+ days ago (or null and `ready_at` is 14+ days ago)
- Can run alongside existing auto-attendance job

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `piece_tracking_ai_enabled` | `false` | Enable AI inscription matching |
| `piece_hold_days` | `60` | Days to hold pieces before recycling |
| `piece_reminder_interval_days` | `14` | Days between reminder emails |
| `piece_delivery_fee` | `10.00` | Delivery fee amount |

## Out of Scope (Future)

- Individual piece gallery entries from batch (link `piece_batches` → `pottery_pieces`)
- QR code labels for pieces
- Weight tracking (before/after firing)
- Kiln batch management (which pieces go in which firing load)
- Delivery address collection and shipping label generation
- Payment processing for delivery fee (handled offline for now)
- Payment processing for extra piece fees (handled offline for now)
