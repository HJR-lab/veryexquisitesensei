---
phase: 260331-fa5
plan: 01
subsystem: auth, admin, frontend
tags: [analytics, login-tracking, engagement, admin-dashboard]
dependency_graph:
  requires: []
  provides: [login-tracking, engagement-metrics, platform-stats]
  affects: [auth, admin-dashboard, student-detail, admin-nav]
tech_stack:
  added: []
  patterns: [fire-and-forget async update, parallel Promise.all count queries, lazy-loaded admin page]
key_files:
  created:
    - frontend/src/pages/AdminPlatformStats.jsx
  modified:
    - server/routes/auth.js
    - server/routes/admin.js
    - frontend/src/pages/AdminDashboard.jsx
    - frontend/src/components/StudentInfoCard.jsx
    - frontend/src/components/AdminNav.jsx
    - frontend/src/App.jsx
decisions:
  - Migration uses try/catch RPC call — columns added manually in Supabase if RPC not available
  - Login tracking is fire-and-forget (non-blocking) with 1-hour dedup to avoid inflated counts
  - Platform stats page uses AdminLayout via /admin/ route prefix (no separate layout needed)
metrics:
  duration: ~15 minutes
  completed: 2026-03-31
  tasks: 3
  files: 6
---

# Phase 260331-fa5 Plan 01: User Activity Tracking & Analytics Summary

**One-liner:** Non-blocking login tracking (last_login_at, login_count) with admin engagement metrics (7d/30d active, never-logged-in) and a platform stats page.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Login tracking on /api/auth/me | 64e9463 | server/routes/auth.js |
| 2 | Engagement endpoint + dashboard section | 54a6865 | server/routes/admin.js, frontend/src/pages/AdminDashboard.jsx |
| 3 | Per-student stats, platform stats page, nav link | 640e37c | StudentInfoCard.jsx, AdminNav.jsx, AdminPlatformStats.jsx, App.jsx |

## What Was Built

### Login Tracking (server/routes/auth.js)
- Idempotent column migration on module load (`last_login_at timestamptz`, `login_count integer DEFAULT 0`)
- In `/api/auth/me`: after successful customer fetch, checks if `last_login_at` is null or older than 1 hour; if so fires a non-blocking Supabase update incrementing `login_count`
- Impersonation sessions (`req.user.isImpersonating`) are excluded — admin views do not inflate student counts
- `/me` response now includes `lastLoginAt` and `loginCount` fields

### Engagement Metrics (server/routes/admin.js)
- `GET /api/admin/dashboard/engagement` — four parallel count queries: total customers, active last 7d, active last 30d, never logged in (IS NULL)
- `GET /api/admin/platform-stats` — seven parallel queries covering all major tables plus login aggregate data
- AdminDashboard fetches engagement in parallel with summary stats; shows Engagement section in right column

### Per-Student Login Stats (frontend/src/components/StudentInfoCard.jsx)
- Below "Member since" line: shows "Last login: DD Mon YYYY (N total)" if `last_login_at` exists
- Shows amber "Never logged in" indicator if `last_login_at` is null

### Platform Stats Page (frontend/src/pages/AdminPlatformStats.jsx)
- Accessible at `/admin/platform-stats`
- Grid of 8 stat cards: Total Students, Total Enrollments, Total Bookings, Gallery Pieces, Active Memberships, Total Classes, Students Who Logged In, Avg Logins/Student
- Settings gear dropdown in AdminNav now includes "Platform Stats" link

## Deviations from Plan

### Auto-handled — no architectural deviations

**Migration approach:** The plan called for `supabaseDb.supabase.rpc('exec_sql', ...)` for the column migration. This is wrapped in try/catch since the `exec_sql` RPC may not exist in all Supabase setups. The columns should be added manually in Supabase if the RPC call fails. This is a known limitation documented here — columns must exist for login tracking to work.

## Known Stubs

None — all data is wired. The `last_login_at` and `login_count` fields will be null/0 until users make `/api/auth/me` calls after the columns are added to the database.

## Self-Check: PASSED

- FOUND: server/routes/auth.js
- FOUND: server/routes/admin.js
- FOUND: frontend/src/pages/AdminPlatformStats.jsx
- FOUND: frontend/src/components/StudentInfoCard.jsx
- FOUND: frontend/src/components/AdminNav.jsx
- FOUND: frontend/src/App.jsx
- Commit 64e9463 exists (Task 1)
- Commit 54a6865 exists (Task 2)
- Commit 640e37c exists (Task 3)
