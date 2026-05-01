# CRM Campaign System Design

**Date:** 2026-05-01
**Status:** Approved

## Overview

In-house CRM campaign system for VES pottery studio. Enables manual email campaigns, automated flows (cron-powered with admin-configurable triggers), and event invitations with RSVP tracking. Built on existing Resend email infrastructure and customer data.

## Database Schema

### `campaigns`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| name | text | Campaign name |
| type | text | `manual` or `automated` |
| subject | text | Email subject line |
| html_body | text | Email HTML content |
| segment | text | Target segment key |
| status | text | `draft`, `scheduled`, `sent`, `active`, `paused` |
| scheduled_at | timestamptz | For manual scheduled sends |
| trigger_type | text | For automated: `post_course`, `lapsed`, `credit_expiry`, `welcome` |
| trigger_days | int | Days after/before trigger event |
| created_by | int | FK to customers (admin) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `campaign_sends`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| campaign_id | int | FK to campaigns |
| customer_id | int | FK to customers |
| sent_at | timestamptz | |
| resend_message_id | text | For tracking delivery |

### `campaign_events`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| campaign_send_id | int | FK to campaign_sends |
| event_type | text | `delivered`, `opened`, `clicked`, `bounced` |
| event_at | timestamptz | |

### `events`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| title | text | Event name |
| description | text | Event details |
| event_date | timestamptz | |
| location | text | |
| max_capacity | int | Nullable for unlimited |
| rsvp_deadline | timestamptz | |
| status | text | `draft`, `published`, `closed` |
| target_segment | text | Segment to invite |
| campaign_id | int | FK to campaigns (the invite email) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `event_rsvps`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| event_id | int | FK to events |
| customer_id | int | FK to customers |
| status | text | `invited`, `attending`, `declined` |
| invited_at | timestamptz | |
| responded_at | timestamptz | |

## Segments

Auto-computed from existing data, no new tables:

| Key | Query Logic |
|-----|-------------|
| `returning` | `course_purchase_count >= 2` |
| `vip` | `course_purchase_count >= 4` |
| `lapsed_30` | Last booking > 30 days ago, no active enrollment |
| `lapsed_60` | Last booking > 60 days ago, no active enrollment |
| `lapsed_90` | Last booking > 90 days ago, no active enrollment |
| `active` | Has active enrollment |
| `hb_students` | Active HB enrollment |
| `wt_students` | Active WT enrollment |
| `has_credits` | Credit balance > 0 |
| `members` | Active membership |
| `all` | All customers with email |

Segment resolver: `server/utils/segmentResolver.js` — single function `resolveSegment(key)` returns array of customer IDs + emails.

## Backend Architecture

### Routes: `server/routes/crm.js`

**Campaign endpoints:**
- `GET /api/admin/crm/campaigns` — list all campaigns
- `POST /api/admin/crm/campaigns` — create campaign
- `PATCH /api/admin/crm/campaigns/:id` — update campaign
- `DELETE /api/admin/crm/campaigns/:id` — delete draft campaign
- `POST /api/admin/crm/campaigns/:id/send` — send manual campaign now
- `GET /api/admin/crm/campaigns/:id/stats` — delivery stats
- `GET /api/admin/crm/segments/:key/preview` — preview segment audience size + sample names

**Automation endpoints:**
- `GET /api/admin/crm/automations` — list automated campaigns with stats
- `PATCH /api/admin/crm/automations/:id` — toggle active/paused, update trigger_days

**Event endpoints:**
- `GET /api/admin/crm/events` — list events
- `POST /api/admin/crm/events` — create event
- `PATCH /api/admin/crm/events/:id` — update event
- `POST /api/admin/crm/events/:id/invite` — send invites to target segment
- `GET /api/admin/crm/events/:id/rsvps` — list RSVPs
- `POST /api/events/:eventId/rsvp` — public RSVP endpoint (no auth, token-based)

### Cron: `server/utils/campaignCron.js`

Runs every hour via existing startup pattern (setInterval). For each active automated campaign:

1. Resolve trigger — find customers who match the trigger condition
2. Filter out customers already in `campaign_sends` for this campaign
3. Send email via Resend using campaign subject/body wrapped in base template
4. Log to `campaign_sends`

**Trigger resolution:**
- `post_course`: Enrollments where `status = 'completed'` and `updated_at` was `trigger_days` ago
- `lapsed`: Customers whose last booking (attended/completed) was `trigger_days` ago, no active enrollment
- `credit_expiry`: Customers with credits expiring within `trigger_days`
- `welcome`: Enrollments created `trigger_days` ago

### Resend Webhook: `POST /api/webhooks/resend`

Receives delivery/open/bounce events from Resend. Matches `resend_message_id` to `campaign_sends`, writes to `campaign_events`.

## Frontend: Admin CRM Tab

New page: `frontend/src/pages/AdminCRM.jsx`

Three sub-tabs:

### Campaigns Tab
- Campaign list (name, segment, status, sent count, open rate)
- Create/edit form: name, subject, body (textarea with HTML preview), segment dropdown
- Send button (immediate) or schedule picker
- Stats view: sent, delivered, opened, bounced

### Automation Tab
- List of automated flows with toggle (active/paused)
- Editable trigger_days per flow
- Audience preview count
- Last sent timestamp, total sends

### Events Tab
- Event list (title, date, RSVP count, capacity)
- Create/edit form: title, description, date, location, capacity, segment
- Invite button → sends to segment
- RSVP list with status breakdown (attending/declined/no response)

## Seed Data

Create default automated campaigns on first run:
1. Post-Course Follow-up (7 days, paused)
2. Lapsed Student Re-engagement (60 days, paused)
3. Credit Expiry Reminder (30 days, paused)
4. Welcome Series (1 day, paused)

All start paused — admin activates via UI.

## Email Templates

New templates in `server/email-templates/`:
- `campaign-wrapper.js` — wraps campaign HTML body in VES branding
- `event-invitation.js` — event details + RSVP button
- `event-rsvp-confirmed.js` — RSVP confirmation

## RSVP Flow

Event invite email contains a unique link: `https://club.ves.sg/events/:eventId/rsvp?token=<jwt>`

JWT encodes `{ customerId, eventId }`. Landing page shows event details with Attend/Decline buttons. No login required.

## Dependencies

- Resend API (existing)
- Base email template (existing)
- Customer data (existing)
- Supabase PostgreSQL (existing)
