# Supabase Auth Magic Link Migration

**Date**: 2026-03-24
**Status**: Approved
**Approach**: Full Supabase Auth (Approach A)

## Overview

Replace the current custom JWT + bcrypt password auth system with Supabase Auth magic links. All users (students and admin) will authenticate via email magic link. The `customers` table remains the source of truth for application access.

## Current State

- Custom JWT auth with bcrypt password hashing in `server/routes/auth.js` (~300 lines)
- `authenticateToken` middleware reads JWT from cookie or Authorization header
- Admin login via `ADMIN_PASSWORD_HASH` env var
- Student onboarding: Shopify sync creates customer → student visits `/verify-email` → enters 6-digit PIN (logged to console, never actually emailed) → sets password at `/setup-password`
- Registration is disabled (returns 403)
- Separate `Login.jsx` and `AdminLogin.jsx` pages
- No Supabase Auth or Supabase client on the frontend
- `auth.js` also contains student dashboard endpoints (`/api/students/me`, `/api/students/me/dashboard`) and profile/password management endpoints

## Design

### 1. Login Flow (Frontend)

Single unified login page for all users. No separate admin login.

1. User enters email, clicks "Send Magic Link"
2. Frontend calls `supabase.auth.signInWithOtp({ email })`
3. User sees: "If you have an account, you'll receive a magic link" (no email enumeration)
4. Supabase sends magic link email
5. User clicks link → redirected to `/auth/callback`
6. Frontend callback page calls `supabase.auth.getSession()` to establish session
7. `onAuthStateChange` fires → app looks up `customers` table by email via `/api/auth/me`
8. Smart redirect: admin → admin dashboard, member → member page, student → gallery

**Note**: Supabase's built-in rate limiting applies (default: 60 emails/hour project-wide). The frontend should show a helpful message if a user requests a link too quickly.

### 2. Backend Auth Middleware

Replace `authenticateToken` to verify Supabase Auth sessions.

**Current flow:**
```
Cookie/Header → jwt.verify() → req.user
```

**New flow:**
```
Authorization header → supabase.auth.getUser(token) → customers table lookup by email → req.user
```

The backend uses the existing Supabase client from `supabaseDb.js` (initialized with `SUPABASE_SERVICE_KEY`) to call `supabase.auth.getUser(token)`. The service key is required here — it allows the server to validate any user's token. No new server dependencies needed (`@supabase/supabase-js` is already installed).

`req.user` shape stays identical:
```js
{
  customerId: customer.shopify_customer_id,
  dbCustomerId: customer.id,
  email: customer.email,
  firstName: customer.first_name,
  lastName: customer.last_name,
  isAdmin: email === 'info@ves.sg',
  // impersonation fields when applicable:
  isImpersonating: false,
  impersonatedBy: null
}
```

All 14 route modules continue reading `req.user` unchanged.

### 3. User Creation & Linking

Supabase Auth users are created lazily at first login attempt.

- Shopify sync creates `customers` row (no Supabase Auth user yet)
- Student enters email at login → `signInWithOtp()` creates `auth.users` entry if none exists, sends magic link
- Student clicks magic link → session established → backend looks up `customers` by email
- If `customers` row exists → normal login
- If no `customers` row exists → backend returns 401 (silent rejection — Supabase Auth user exists but has no application access)

The `customers` table is the access gate. `auth.users` is just for authentication mechanics.

No migration needed for existing students. First magic link login auto-links by email.

### 4. Impersonation

Replace custom JWT minting with a signed cookie approach.

**Endpoint**: `POST /api/admin/impersonate/:studentId`
- Verify caller is admin via Supabase Auth token
- Set signed httpOnly cookie: `ves_impersonate = <studentId>`
- Return the impersonated student's user object so frontend can update state immediately

**Middleware behavior** (in `authenticateToken`):
1. Verify Supabase Auth token → get authenticated user
2. Check if admin (`email === 'info@ves.sg'`)
3. If admin AND impersonation cookie exists → look up target student → set `req.user` to student data with `isImpersonating: true`, `impersonatedBy: admin email`
4. If non-admin has cookie → ignore it

**Endpoint**: `POST /api/auth/stop-impersonation` (same path as current — no frontend change needed)
- Verify caller is admin via Supabase Auth token
- Clear the `ves_impersonate` cookie
- Return the admin's own user object so frontend can update state immediately

**Frontend behavior**: Both `ImpersonationBanner.jsx` and `Navigation.jsx` call `POST /auth/stop-impersonation` and refresh user state. The `useAuth` hook needs an `updateUser()` or `refreshUser()` method (it already has `updateUser`). After stop-impersonation response, call `updateUser(response.data.user)` to swap back to admin view.

Admin never loses their real Supabase Auth session — impersonation is purely a server-side overlay.

### 5. Frontend Auth Architecture

**New dependency**: `@supabase/supabase-js` in `frontend/package.json`

**New file**: `frontend/src/utils/supabase.js`
```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
export default supabase
```

**New env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**`useAuth` hook** — updated internals, same external API:
- `login(email)` — calls `signInWithOtp`, no password param
- `logout()` — calls `supabase.auth.signOut()`
- `user` — populated from `/api/auth/me` after session established
- `loading` — true until session check completes
- `updateUser(user)` — kept for impersonation state updates
- Subscribes to `onAuthStateChange` to handle token refresh and session events

**Axios interceptor** — reads Supabase session token and sets Authorization header. The Supabase JS client auto-refreshes tokens, so `getSession()` returns the current valid token:
```js
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})
```

**`authAPI` object** in `api.js` — trimmed to just `getMe()` and `logout()`. Login/register methods removed (handled directly by Supabase client in `useAuth`).

**New page**: `frontend/src/pages/AuthCallback.jsx` — handles magic link redirect, calls `getSession()`, redirects to app.

**New route**: `/auth/callback` in `App.jsx`

**Security note**: Supabase Auth stores tokens in localStorage (not httpOnly cookies). This is Supabase's standard approach. The tradeoff vs the current httpOnly cookie is that localStorage is accessible to JavaScript (XSS risk), but Supabase handles token refresh and expiry automatically. For a studio management app this is an acceptable tradeoff.

### 6. Files Changed

**Deleted:**
- `frontend/src/pages/VerifyEmail.jsx`
- `frontend/src/pages/SetupPassword.jsx`
- `frontend/src/pages/AdminLogin.jsx`
- `frontend/src/pages/Register.jsx`

**Rewritten:**
- `frontend/src/pages/Login.jsx` — magic link form (email only, no password)
- `frontend/src/hooks/useAuth.jsx` — Supabase Auth session management
- `server/routes/auth.js` — retains `/api/auth/me`, `/api/auth/logout`, `/api/auth/stop-impersonation`, `/api/auth/profile` (without JWT re-issuance), `/api/students/me`, `/api/students/me/dashboard`. Removes: login, register, verification, password setup, change-password endpoints.
- `server/index.js` — `authenticateToken` rewritten for Supabase token verification + impersonation cookie check

**New:**
- `frontend/src/utils/supabase.js` — Supabase client
- `frontend/src/pages/AuthCallback.jsx` — magic link callback handler

**Updated:**
- `frontend/src/utils/api.js` — axios interceptor for Supabase token, `authAPI` trimmed
- `frontend/src/App.jsx` — remove VerifyEmail/SetupPassword/AdminLogin/Register routes, add `/auth/callback`, change `AdminRoute` redirect from `/admin/login` to `/login`
- `frontend/src/components/ImpersonationBanner.jsx` — update stop-impersonation handler to use `updateUser()` with response data
- `frontend/src/components/Navigation.jsx` — same stop-impersonation update
- `server/index.js` — update CORS origins to include `https://www.ves.sg`

**Profile endpoint changes** (`PUT /api/auth/profile`):
- Remove JWT re-issuance (lines 817-828 of current auth.js)
- Return `{ user }` instead of `{ token, user }` — frontend no longer needs a token back
- Frontend profile update handler should stop storing the returned token (if it does)

**No changes:**
- All 14 route modules (`routes/admin.js`, `routes/classes.js`, etc.)
- `server/utils/supabaseDb.js`
- All frontend pages (except auth pages listed above)

### 7. Dependencies

**Removed from `server/package.json`:**
- `bcryptjs`
- `jsonwebtoken`

**Added to `frontend/package.json`:**
- `@supabase/supabase-js`

**Removed env vars:**
- `JWT_SECRET`
- `ADMIN_PASSWORD_HASH`

**Note**: `@supabase/supabase-js` is already in `server/package.json` — no server dependency changes needed.

### 8. Database Changes

- `verification_codes` table — drop (no longer needed)
- `password_hash` column on `customers` — can drop later (not urgent, just unused)

### 9. Supabase Dashboard Setup

- Enable Email OTP/Magic Link in Auth → Providers → Email
- Disable "Require email confirmation" (access gated by `customers` table, not email confirmation)
- Set Site URL: `https://www.ves.sg`
- Add redirect URLs:
  - `https://www.ves.sg/auth/callback`
  - `http://localhost:5173/auth/callback`
- Customize magic link email template with VES branding
- Configure JWT expiry to match desired session length (Supabase default is 1 hour with auto-refresh; current system uses 7-day tokens)
- SMTP: start with Supabase built-in, upgrade to custom SMTP (Resend/SendGrid) if rate-limited

### 10. Post-Implementation Reminder

**ACTION REQUIRED**: Configure `www.ves.sg` as the site URL and redirect URL in the Supabase dashboard after deployment.
