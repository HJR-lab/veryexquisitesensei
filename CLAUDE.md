# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VES Pottery Gallery App — a full-stack studio management system for a pottery studio (VES, Singapore). Manages student portfolios, class scheduling/booking, memberships, and integrates with Shopify for customer sync and order processing.

## Development Commands

### Frontend (`frontend/`)
```bash
npm run dev      # Vite dev server on http://localhost:5173 (proxies /api to :3001)
npm run build    # Build to frontend/dist/
```

### Backend (`server/`)
```bash
npm run dev      # nodemon on http://localhost:3001 (PORT in server/.env; code default is 3000)
npm start        # Production start
```

Both servers must run simultaneously for local development. No test suite exists currently.

### E2E Tests (`frontend/`)
```bash
npx playwright test              # Run all Playwright tests
npx playwright test tests/foo    # Run specific test file
```

## Architecture

### Three Independent Apps
```
frontend/          → React 18 + Vite + Tailwind CSS SPA
server/            → Express.js API (~8000 lines in index.js)
extensions/        → Shopify customer account UI extension (separate deploy)
```

Each has its own `package.json`. Not a monorepo — no shared workspace config.

### Backend (server/)

**Single-file API server** — nearly all routes are in `server/index.js` (90+ endpoints). Key patterns:

- **Database**: Supabase PostgreSQL via `@supabase/supabase-js` (not Prisma). All DB access goes through `server/utils/supabaseDb.js` which wraps Supabase client queries.
- **Auth**: JWT tokens (7-day expiry). `authenticateToken` middleware checks `Authorization` header first, then cookie. Admin is identified by email `info@ves.sg`.
- **Shopify**: GraphQL client for customer data sync. Webhook handlers for order/customer events.
- **Image uploads**: Multer → Supabase Storage bucket.
- **OpenAI**: used for piece image matching (`server/routes/pieces.js`) and Gmail inbox triage (`server/utils/inboxProcessor.js`). There is no general chat endpoint.

**Key utility modules** in `server/utils/`:
- `supabaseDb.js` — Database adapter (CRUD for customers, enrollments, classes, bookings)
- `cohortAutoProcessor.js` — Auto-creates wheelthrowing classes when 4+ students enroll
- `courseEnrollmentManager.js` — Handles enrollment logic, credit allocation
- `courseScheduler.js` — Generates class schedules from course definitions
- `shopifySync.js` — Bidirectional Shopify customer sync
- `imageUpload.js` — Supabase Storage image handling
- `calendarGenerator.js` — ICS file generation for calendar export

### Frontend (frontend/)

- **Routing**: React Router v6 in `App.jsx` with `PrivateRoute` and `AdminRoute` wrappers
- **Auth**: `useAuth` hook (`frontend/src/hooks/useAuth.jsx`) — provides user context, handles JWT storage
- **API calls**: Axios with automatic JWT injection via interceptor (`frontend/src/utils/api.js`). Always import this shared client (`import api from '../utils/api'`) — importing `axios` directly skips the `Authorization` and `X-Impersonate-Id` headers and every authenticated request 401s.
- **Styling**: Tailwind CSS 3 with custom pottery studio theme
- **Pages**: `src/pages/` for main pages, `src/test-pages/` for admin test variants
- **Components**: `src/components/` — Navigation, ClassCalendarGrid, PotteryCard, AdminLayout, etc.

### Database Tables (Supabase PostgreSQL)
Core tables: `customers`, `course_enrollments`, `class_instances`, `bookings`, `pottery_pieces`, `memberships`, `reschedule_fees`, `verification_codes`

### Two Class Types
1. **Wheelthrowing (WT)** — Course-based. Auto-creates class instances when 4+ students enrolled in same timeslot. Students get allocated classes (typically 6/course).
2. **Handbuilding (HB)** — Credit-based drop-in. Students purchase 4 or 8 credits and book individual sessions.

## Deployment

- **Frontend**: Vercel (static build from `frontend/dist/`)
- **Backend**: Vercel serverless or self-hosted Node.js
- **Database**: Supabase cloud (PostgreSQL)
- **Environment**: `server/.env` for API keys/secrets, `frontend/.env` for `VITE_API_URL`

## Conventions

- Backend uses CommonJS (`require`/`module.exports`), frontend uses ES modules
- API routes follow `/api/{domain}/{action}` pattern (e.g., `/api/admin/students`, `/api/classes/book`)
- Supabase error code `PGRST116` means "no rows found" and is handled as a non-error throughout
- `server/scripts/` holds one-off debug/fix/verify utilities (e.g., `diagnose-*.js`, `verify-*.js`) — ad-hoc tools, not part of the application. `server/` itself contains only `index.js`

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
