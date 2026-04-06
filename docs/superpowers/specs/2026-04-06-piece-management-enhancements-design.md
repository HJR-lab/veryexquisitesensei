# Piece Management Enhancements — Design Spec

**Date:** 2026-04-06
**Status:** Approved

## Overview

Four features to complete the staff/admin piece management experience, closing gaps in the piece lifecycle from kiln to collection.

---

## Feature 1: Kiln Firing Runs

Group student batches into studio-wide kiln loads so staff can manage firings as a unit rather than advancing batches individually.

### Why

Batches currently move through the pipeline independently. In reality, staff loads a kiln with a hand-picked selection of batches (especially for glaze firings where space and piece size matter) and fires them together. The system should reflect this.

### Database

**New table: `firing_runs`**

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| firing_type | text | `bisque` or `glaze` |
| status | text | `loading` → `firing` → `completed` |
| notes | text | Optional staff notes |
| created_at | timestamptz | Default now() |
| fired_at | timestamptz | Set when status → firing |
| completed_at | timestamptz | Set when status → completed |

**New table: `firing_run_batches`** (join table)

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| firing_run_id | int FK | References firing_runs |
| piece_batch_id | int FK | References piece_batches, UNIQUE |

Unique constraint on `piece_batch_id` — a batch can only be in one active firing run at a time.

### Admin Workflow

1. On the pipeline page, admin selects batches via checkboxes (existing UI)
2. New action in bulk bar: "Create Firing Run"
3. Pick type: bisque or glaze
4. All selected batches are assigned to the new run and advanced to the next status (`logged` → `bisque_fired`, or `bisque_fired`/`glaze_fired` depending on type)
5. When kiln is done, admin marks the run as completed — all batches in that run advance to the next status
6. Firing run history preserved for records

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/admin/pieces/firing-runs` | Create run + assign batches + advance statuses |
| GET | `/api/admin/pieces/firing-runs` | List runs (active + recent completed) |
| GET | `/api/admin/pieces/firing-runs/:id` | Single run with its batches |
| PUT | `/api/admin/pieces/firing-runs/:id/complete` | Mark run completed, advance all batches |

### Frontend Changes

- **AdminPiecePipeline.jsx**: Add "Create Firing Run" button to bulk action bar. Add firing run history section (collapsible) showing recent runs with batch counts and dates.
- New modal/inline form for creating a run: type selector (bisque/glaze) + optional notes.

---

## Feature 2: Auto-Recycle After 60 Days

Automatically transition uncollected pieces to "recycled" status when the 60-day hold period expires.

### Why

The `hold_expires_at` field is set when a batch is marked ready, and escalating reminder emails already run every 14 days. But when the hold actually expires, nothing happens — pieces sit in limbo. This closes the loop.

### Implementation

**In `cohortAutoProcessor.js`** — add to the daily 2AM job:

1. Query batches where `hold_expires_at < now()` AND status IN (`ready`, `collecting`, `delivering`)
2. Update each to status `recycled`, set `completed_at = now()`
3. Send disposal email to each student

### Disposal Email Template

**New file: `server/email-templates/pieces/pieces-recycled.js`**

Warm, no-guilt tone:

> Hi [Name],
>
> We've been keeping your [N] pieces safe for 60 days since they were ready. As we need to make space in the studio for new work, we've unfortunately had to let them go.
>
> We hope you enjoyed making them — and we'd love to see you back at the wheel soon!

Subject: "A note about your pottery pieces"

### Email Sequence Summary

| Day | Action |
|-----|--------|
| 0 | Batch marked ready, student notified |
| 14 | Reminder 1 |
| 28 | Reminder 2 |
| 42 | Reminder 3 |
| 53 | Final warning (7 days left) |
| 60 | Auto-recycled + disposal email |

---

## Feature 3: Admin Gallery Management

Admin page to browse, curate, and moderate student gallery uploads (pottery_pieces table).

### Why

Students upload finished pieces to their gallery but staff have no visibility or control. Need moderation (delete inappropriate uploads) and curation (feature pieces on public gallery).

### Page: AdminGallery.jsx

**Search**: By initials only, minimum 3 characters (letters/numbers/symbols). Consistent with pipeline search approach.

**Grid layout**: Piece cards showing thumbnail, student initials, clay type, date uploaded.

**Actions per piece**:
- Toggle `featured` (star/unstar for public gallery prominence)
- Toggle `is_public` (show/hide from public gallery)
- Delete piece (with confirmation)

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/gallery/pieces` | All pieces with student info, paginated |
| GET | `/api/admin/gallery/search?initials=` | Search by initials (min 3 chars) |
| PUT | `/api/admin/gallery/pieces/:id/feature` | Toggle featured status |
| PUT | `/api/admin/gallery/pieces/:id/visibility` | Toggle public/private |
| DELETE | `/api/admin/gallery/pieces/:id` | Delete piece |

### Database

No schema changes — uses existing `pottery_pieces` table with `featured` and `is_public` columns. Uses existing `getAllPotteryPieces()` function in supabaseDb.js. Search joins `pottery_pieces` → `customers` on `customer_id` to match against `customers.initials`.

### Frontend Route

`/admin/gallery` — added to admin routes in App.jsx.

---

## Feature 4: Student Collection Flow with Appointment + Glass Cabinet

Replace the simple "I'll Collect" button with a proper appointment-based flow where the student picks a collection date, staff places pieces in the outside glass cabinet, and the student confirms pickup.

### Why

Currently when a student chooses "I'll Collect", there's no way for staff to know when they're coming. Pieces can't be left in the cabinet indefinitely. The new flow ensures staff knows when to place pieces and can confirm they've been picked up.

### New Status: `in_cabinet`

Added between `collecting` and `collected` in the status progression.

Full status flow for collection:
```
ready → collecting (student picks date) → in_cabinet (staff places) → collected (student confirms)
```

### New Fields on `piece_batches`

| Column | Type | Notes |
|--------|------|-------|
| collection_date | timestamptz | Student's chosen pickup date, must be 2+ days from now |
| cabinet_placed_at | timestamptz | When staff placed pieces in cabinet |

### Student Flow

1. Batch marked **ready** → student gets existing "pieces ready" email
2. Student chooses **"I'll Collect"** → date picker appears (any date, 2+ days out)
3. Student picks date → status becomes `collecting`, `collection_date` set
4. Staff sees upcoming collections on pipeline dashboard
5. Staff places pieces in glass cabinet → marks **"In Cabinet"** → status becomes `in_cabinet`, `cabinet_placed_at` set
6. Student gets email: "Your pieces are in the glass cabinet — pick them up anytime!"
7. Student picks up and taps **"I've Collected"** in app → status becomes `collected`
8. Fallback: staff can also mark as collected if student forgets to confirm

### Delivery Flow (unchanged)

Student chooses "Deliver ($10)" → status becomes `delivering` → staff ships → marks `shipped`. No appointment needed.

### Cabinet Notification Email

**New file: `server/email-templates/pieces/pieces-in-cabinet.js`**

> Hi [Name],
>
> Your [N] pieces are now in the glass cabinet outside the studio — come pick them up anytime!
>
> Once you've collected them, just tap the button below to let us know.
>
> [I've Collected My Pieces →]

### Admin Pipeline Changes

- **Collecting section**: Show batches with collection dates. Highlight batches where collection date is today or past.
- **"Place in Cabinet" button**: Appears on collecting batches. Sets status to `in_cabinet`.
- **Upcoming collections view**: Staff can see what's coming up to plan cabinet placement.
- **"Mark Collected" button**: Fallback for staff to confirm collection.

### Student UI Changes (MyPieces.jsx)

- When status is `ready`: replace simple "I'll Collect" with "I'll Collect" + date picker (min 2 days out)
- When status is `collecting`: show chosen date, "Waiting for studio to prepare"
- When status is `in_cabinet`: show "Your pieces are in the cabinet!" + "I've Collected" confirmation button
- When status is `collected`: show "Collected ✓" with date

---

## Status Progression Summary (Updated)

```
logged → bisque_fired → glaze_fired → ready
                                        ↓
                              ┌─── collect ───┐
                              ↓               ↓
                          collecting      delivering
                         (+ date)             ↓
                              ↓            shipped
                         in_cabinet
                              ↓
                          collected

After 60 days with no action from ready/collecting/delivering:
  → recycled (auto)
```

---

## Files to Create/Modify

### New Files
- `server/migrations/firing_runs.sql` — firing_runs + firing_run_batches tables
- `server/migrations/piece_batches_v2.sql` — add collection_date, cabinet_placed_at columns, in_cabinet status
- `server/email-templates/pieces/pieces-recycled.js` — disposal email
- `server/email-templates/pieces/pieces-in-cabinet.js` — cabinet notification
- `frontend/src/pages/AdminGallery.jsx` — admin gallery management page

### Modified Files
- `server/routes/pieces.js` — firing run endpoints, cabinet/collection endpoints, admin gallery endpoints
- `server/utils/supabaseDb.js` — new DB functions for firing runs, gallery search, auto-recycle queries
- `server/utils/cohortAutoProcessor.js` — add auto-recycle to daily job
- `frontend/src/pages/AdminPiecePipeline.jsx` — firing run UI, collection dates, in_cabinet actions
- `frontend/src/pages/MyPieces.jsx` — date picker, cabinet status, collection confirmation
- `frontend/src/App.jsx` — add /admin/gallery route
