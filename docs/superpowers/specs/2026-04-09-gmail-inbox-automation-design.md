# Gmail Inbox Automation — Design Spec

**Date**: 2026-04-09
**Goal**: Auto-classify incoming student emails and draft replies that redirect them to club.ves.sg for self-service. Transitional tool — as platform adoption grows, email volume decreases.

## Architecture

```
Cron (every 5 min)
  → Gmail API: fetch new unread emails
  → For each email:
      1. Match sender → customers table (get student context)
      2. OpenAI: classify + draft reply (single call)
      3. Store in inbox_messages table
  → Admin opens /admin/inbox
      → Sees classified emails with ready drafts
      → Review → edit if needed → Send or Dismiss
```

Nothing sends without admin clicking Send.

## Gmail OAuth2

- OAuth2 refresh token approach (not service account)
- Google Cloud project with Gmail API enabled
- OAuth2 web app credentials
- Admin connects once at `/admin/settings/gmail-connect` → Google consent → store refresh token
- Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`
- Refresh token stored in `admin_settings` table
- Google Auth library handles automatic token refresh

## Email Categories

| Category | Supabase Lookup | club.ves.sg Link | Example Draft |
|----------|----------------|------------------|---------------|
| Piece collection | pottery_pieces + firing status | /dashboard | "Your pieces are ready from {date}" |
| Makeup class | bookings + credits remaining | /classes | "You have {n} credits, reschedule at..." |
| Firing enquiry | pottery_pieces + firing_runs | /dashboard | "Your piece is currently in {stage}" |
| Next cohort | class_instances (future, spots) | /classes | "Next {day} course starts {date}, {n} spots" |
| Membership | memberships table | /membership | "Your membership is {status}, renew at..." |
| Studio access | studio_access_bookings | /studio-access | "Book studio sessions at..." |
| General / other | basic student info | /dashboard | Friendly redirect to platform |

## AI Classification & Draft Generation

Single OpenAI call per email using gpt-4o:

```
System: You are VES Studio's email assistant. Classify the email into one
of these categories: piece_collection, makeup_class, firing_enquiry, 
next_cohort, membership, studio_access, general.

Draft a concise, warm reply that:
- Acknowledges their specific question
- Provides relevant data from their student record
- Directs them to the specific club.ves.sg page where they can self-serve
- Signs off as "Eve, Ves Studio"

Student data is provided as context. If no student match, draft a generic 
helpful reply.

Respond as JSON: { category, confidence, summary, draftReply }
```

Student context payload sent to OpenAI:
- Name, email, customer type
- Active enrollments (course type, credits remaining, upcoming bookings)
- Pottery pieces (status, firing stage)
- Membership status
- Recent bookings

## Data Model

### New table: `inbox_messages`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| gmail_message_id | text UNIQUE | Dedup — skip already-processed emails |
| gmail_thread_id | text | Thread grouping |
| from_email | text | Sender email |
| from_name | text | Sender display name |
| subject | text | Email subject line |
| body_snippet | text | First ~500 chars of body |
| received_at | timestamptz | Email timestamp |
| category | text | AI classification result |
| confidence | float | 0-1 classification confidence |
| summary | text | One-line AI summary |
| draft_reply | text | AI-generated draft |
| student_id | int (FK → customers) | Matched student, null if unknown |
| status | text | `new`, `draft_ready`, `sent`, `dismissed` |
| sent_at | timestamptz | When reply was sent |
| created_at | timestamptz | When row was created |

## Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/inbox` | List inbox messages (paginated, filterable by category/status) |
| POST | `/api/admin/inbox/refresh` | Trigger manual refresh (also runs on cron) |
| PUT | `/api/admin/inbox/:id` | Update draft text |
| POST | `/api/admin/inbox/:id/send` | Send the draft reply via Gmail API |
| POST | `/api/admin/inbox/:id/dismiss` | Mark as dismissed |
| GET | `/api/admin/inbox/stats` | Unread count by category (for nav badge) |
| GET | `/api/admin/settings/gmail` | Gmail connection status |
| GET | `/api/admin/settings/gmail/connect` | Start OAuth2 flow |
| GET | `/api/admin/settings/gmail/callback` | OAuth2 callback, store refresh token |

## Cron Job

- Runs every 5 minutes
- Fetches unread emails from Gmail (last 7 days, skip if already in inbox_messages)
- Filters out automated/newsletter emails (unsubscribe header, noreply senders)
- Processes each: match student → classify + draft → store
- Lightweight: skips emails already in DB (gmail_message_id unique check)

## Frontend: `/admin/inbox`

### Layout
- Category filter tabs across top (All, Piece Collection, Makeup, Firing, etc.)
- Badge counts per category
- List view: sender, subject snippet, category badge, time ago, status
- Click to expand inline: full email body, student context card, editable draft
- Actions per email: Send, Edit, Dismiss

### Student Context Card (when matched)
- Name, email, customer type
- Active courses + credits remaining
- Upcoming bookings count
- Pieces in pipeline

### Nav Integration
- Badge on admin sidebar showing unread inbox count
- Refreshes on page load

## File Structure

```
server/
  routes/inbox.js          — API endpoints
  utils/gmailClient.js     — Gmail OAuth2 + API wrapper
  utils/inboxProcessor.js  — Classification + draft generation logic
  cron/inboxCron.js        — Scheduled polling job

frontend/
  src/pages/AdminInbox.jsx  — Inbox UI
```

## Environment Variables (new)

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://ves-pottery-api-production.up.railway.app/api/admin/settings/gmail/callback
```

## Out of Scope

- Thread/conversation view (just single messages for now)
- Auto-sending without admin review
- Email templates for replies (plain text is fine)
- Multi-account Gmail support
- Attachments handling
