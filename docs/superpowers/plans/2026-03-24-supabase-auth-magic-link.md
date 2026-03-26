# Supabase Auth Magic Link Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom JWT + bcrypt password auth with Supabase Auth magic links for all users.

**Architecture:** Frontend Supabase client handles magic link OTP flow and session management. Backend middleware validates Supabase tokens via service-key client, maps to `customers` table by email. Impersonation uses signed cookies instead of custom JWTs.

**Tech Stack:** Supabase Auth, @supabase/supabase-js (frontend), Express.js, React

**Spec:** `docs/superpowers/specs/2026-03-24-supabase-auth-magic-link-design.md`

---

## File Structure

**New files:**
- `frontend/src/utils/supabase.js` — Supabase client singleton
- `frontend/src/pages/AuthCallback.jsx` — magic link redirect handler

**Rewritten files:**
- `frontend/src/pages/Login.jsx` — email-only magic link form
- `frontend/src/hooks/useAuth.jsx` — Supabase session management
- `server/index.js` — `authenticateToken` middleware (lines 58-71)
- `server/routes/auth.js` — remove password/verification endpoints, rewrite impersonation

**Updated files:**
- `frontend/src/utils/api.js` — axios interceptor for Supabase token
- `frontend/src/App.jsx` — route cleanup
- `frontend/src/pages/Account.jsx` — remove change password section
- `frontend/src/components/ImpersonationBanner.jsx` — refresh user after stop
- `frontend/src/components/Navigation.jsx` — refresh user after stop

**Deleted files:**
- `frontend/src/pages/VerifyEmail.jsx`
- `frontend/src/pages/SetupPassword.jsx`
- `frontend/src/pages/AdminLogin.jsx`
- `frontend/src/pages/Register.jsx`

---

### Task 1: Install frontend Supabase dependency and create client

**Files:**
- Create: `frontend/src/utils/supabase.js`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install @supabase/supabase-js**

```bash
cd frontend && npm install @supabase/supabase-js
```

- [ ] **Step 2: Create Supabase client singleton**

Create `frontend/src/utils/supabase.js`:

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase
```

- [ ] **Step 3: Add env vars to frontend/.env**

Add to `frontend/.env`:
```
VITE_SUPABASE_URL=https://fpdbfbxpthmaceuspcrf.supabase.co
VITE_SUPABASE_ANON_KEY=<copy from Supabase dashboard → Settings → API → anon public key>
```

The URL is already known from `server/utils/supabaseDb.js:10`. The anon key is in the Supabase dashboard.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/supabase.js frontend/package.json frontend/package-lock.json
git commit -m "feat: add Supabase client to frontend for auth migration"
```

---

### Task 2: Add axios interceptor for Supabase token

**Files:**
- Modify: `frontend/src/utils/api.js`

- [ ] **Step 1: Add Supabase token interceptor to api.js**

At the top of `frontend/src/utils/api.js`, add the import:

```js
import supabase from './supabase';
```

After the `api` instance is created (after line 11), add the interceptor:

```js
// Attach Supabase Auth token to all API requests
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});
```

- [ ] **Step 2: Trim authAPI object**

Replace the current `authAPI` object (lines 13-38) with:

```js
// Auth API
export const authAPI = {
  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },

  logout: async () => {
    await api.post('/auth/logout');
  },
};
```

The `login()` and `register()` methods are removed — login is handled directly via Supabase client in `useAuth`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/api.js
git commit -m "feat: add Supabase token interceptor, trim authAPI"
```

---

### Task 3: Rewrite useAuth hook for Supabase sessions

**Files:**
- Rewrite: `frontend/src/hooks/useAuth.jsx`

- [ ] **Step 1: Rewrite useAuth.jsx**

Replace entire contents of `frontend/src/hooks/useAuth.jsx`:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import supabase from '../utils/supabase';
import { authAPI } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await authAPI.getMe();
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Check for existing session on mount
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetchUser();
      }
      setLoading(false);
    };

    initAuth();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          await fetchUser();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUser]);

  const login = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    // No immediate user — they need to click the magic link
  };

  const logout = async () => {
    await supabase.auth.signOut();
    await authAPI.logout(); // Clear server-side impersonation cookie if any
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

Key changes from current:
- `login(email)` takes only email (no password), calls `signInWithOtp`
- `register()` removed entirely
- `onAuthStateChange` listener handles session lifecycle
- Added `refreshUser()` for impersonation flow
- `logout()` also calls server to clear impersonation cookie

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useAuth.jsx
git commit -m "feat: rewrite useAuth for Supabase Auth sessions"
```

---

### Task 4: Rewrite Login page and create AuthCallback

**Files:**
- Rewrite: `frontend/src/pages/Login.jsx`
- Create: `frontend/src/pages/AuthCallback.jsx`

- [ ] **Step 1: Rewrite Login.jsx**

Replace entire contents of `frontend/src/pages/Login.jsx`:

```jsx
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import '../styles/Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Check Your Email</h1>
            <p>
              If you have an account, we've sent a sign-in link to{' '}
              <strong>{email}</strong>
            </p>
          </div>
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
            <p>Click the link in the email to sign in.</p>
            <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
              Don't see it? Check your spam folder.
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={() => { setSent(false); setEmail(''); }}
            style={{ marginTop: '1rem' }}
          >
            Try a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>VES Pottery Gallery</h1>
          <p>Enter your email to receive a sign-in link</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your.email@example.com"
              autoFocus
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Sending...' : 'Send Sign-In Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AuthCallback.jsx**

Create `frontend/src/pages/AuthCallback.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../utils/supabase';
import { useAuth } from '../hooks/useAuth';
import '../styles/Auth.css';

export default function AuthCallback() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase client auto-detects the token fragment in the URL
      const { error } = await supabase.auth.getSession();
      if (error) {
        console.error('Auth callback error:', error);
        setError('Sign-in failed. Please try again.');
      }
      // onAuthStateChange in useAuth will handle the rest (fetch user, set state)
    };

    handleCallback();
  }, []);

  // Once user is populated by useAuth, redirect
  useEffect(() => {
    if (user) {
      if (user.isAdmin) {
        navigate('/admin', { replace: true });
      } else if (user.hasMembership && !user.hasActiveEnrollments) {
        navigate('/member', { replace: true });
      } else {
        navigate('/gallery', { replace: true });
      }
    }
  }, [user, navigate]);

  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Sign-In Failed</h1>
            <p>{error}</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/login')}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Signing you in...</h1>
          <div className="spinner" style={{ margin: '2rem auto' }}></div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Login.jsx frontend/src/pages/AuthCallback.jsx
git commit -m "feat: rewrite Login to magic link, add AuthCallback page"
```

---

### Task 5: Update App.jsx routes

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Update imports**

At the top of `frontend/src/App.jsx`:

Remove these imports (lines 5-8):
```js
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import SetupPassword from './pages/SetupPassword';
```

Add this import:
```js
import AuthCallback from './pages/AuthCallback';
```

- [ ] **Step 2: Fix AdminRoute redirect**

In the `AdminRoute` component (line 79), change:
```js
return <Navigate to="/admin/login" />;
```
to:
```js
return <Navigate to="/login" />;
```

- [ ] **Step 3: Update routes**

Remove these route blocks:
- `/admin/login` route (lines 145-151)
- `/register` route (lines 153-160)
- `/verify-email` route (lines 161-167)
- `/setup-password` route (line 169)

Add the callback route after the `/login` route:
```jsx
<Route path="/auth/callback" element={<AuthCallback />} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: update routes for magic link auth (remove old auth pages, add callback)"
```

---

### Task 6: Rewrite backend authenticateToken middleware

**Files:**
- Modify: `server/index.js` (lines 1-10 for imports, lines 58-71 for middleware)

- [ ] **Step 1: Clean up server/index.js top section**

In `server/index.js`:

1. Remove the `jwt` require (line 5):
```js
// DELETE: const jwt = require('jsonwebtoken');
```

2. Remove the `JWT_SECRET` const and fatal check (lines 14-15):
```js
// DELETE: const JWT_SECRET = process.env.JWT_SECRET;
// DELETE: if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not set'); process.exit(1); }
```

3. Replace the existing `app.use(cookieParser())` at line 37 with a signed version:
```js
app.use(cookieParser(process.env.COOKIE_SECRET));
```

**Important**: `COOKIE_SECRET` must be set as an env var in `server/.env`. Generate a random string for it. Do NOT use a hardcoded fallback in production.

- [ ] **Step 2: Rewrite authenticateToken**

Replace the `authenticateToken` function (lines 58-71 of `server/index.js`) with:

```js
// Middleware to verify Supabase Auth token
async function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Verify token with Supabase Auth (uses service key)
    const { data: { user: authUser }, error: authError } = await supabaseDb.supabase.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Look up customer by email
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('id, email, first_name, last_name, shopify_customer_id, role')
      .eq('email', authUser.email)
      .single();

    if (customerError || !customer) {
      return res.status(401).json({ error: 'No account found' });
    }

    const isAdmin = customer.email === 'info@ves.sg';

    // Check for impersonation cookie (admin only)
    const impersonateId = req.signedCookies?.ves_impersonate;
    if (impersonateId && isAdmin) {
      const { data: target, error: targetError } = await supabaseDb.supabase
        .from('customers')
        .select('id, email, first_name, last_name, shopify_customer_id, role')
        .eq('id', impersonateId)
        .single();

      if (!targetError && target) {
        req.user = {
          customerId: target.shopify_customer_id,
          dbCustomerId: target.id,
          email: target.email,
          firstName: target.first_name,
          lastName: target.last_name,
          isAdmin: false,
          isImpersonating: true,
          impersonatedBy: customer.email,
          role: target.role || 'student'
        };
        return next();
      }
    }

    req.user = {
      customerId: customer.shopify_customer_id,
      dbCustomerId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      isAdmin,
      isImpersonating: false,
      impersonatedBy: null,
      role: customer.role || 'student'
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 3: Export getStudioAccessPasses from instructors.js and add to deps**

The `getStudioAccessPasses` function is defined inside `server/routes/instructors.js` (line 672) but is NOT exported or passed to auth.js via deps (pre-existing bug). Fix this:

In `server/routes/instructors.js`, at the end of the file (before the closing `}`), export it:
```js
// Export for use by other modules
app.locals.getStudioAccessPasses = getStudioAccessPasses;
```

Actually, simpler: change `server/index.js` to load instructors BEFORE auth, and pass the function through deps. But since instructors.js defines it inside the module closure, the cleanest fix is:

Move `getStudioAccessPasses` to `server/utils/supabaseDb.js` or create `server/utils/studioAccess.js`, then import it in both `auth.js` and `instructors.js`. For now, just require it directly in auth.js:

Create `server/utils/studioAccess.js` with the `getStudioAccessPasses` function extracted from `instructors.js` (lines 672-760). Then:
- In `auth.js`: `const { getStudioAccessPasses } = require('../utils/studioAccess');`
- In `instructors.js`: `const { getStudioAccessPasses } = require('../utils/studioAccess');` (replace the inline definition)
- Remove `getStudioAccessPasses` from the `auth.js` module destructuring

- [ ] **Step 4: Update CORS origins**

In `server/index.js` (lines 20-28), add `https://www.ves.sg` to the origins array:

```js
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'https://www.ves.sg',
    'https://pottery-gallery-app.vercel.app',
    'https://pottery-gallery-app-frontend.vercel.app',
    'https://frontend-phi-seven-81.vercel.app'
  ],
  credentials: true
}));
```

- [ ] **Step 5: Update deps object**

The `deps` object (line 89) passes `authenticateToken` to route modules. Since it's the same variable name, no change needed — the route modules will automatically use the new implementation.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/package.json server/package-lock.json
git commit -m "feat: rewrite authenticateToken for Supabase Auth + impersonation cookie"
```

---

### Task 7: Rewrite server/routes/auth.js

**Files:**
- Rewrite: `server/routes/auth.js`

This is the largest task. The file currently contains: login, register, verification, password management, profile update, student dashboard endpoints, impersonation, and logout. We keep: `/api/auth/me`, `/api/auth/logout`, `/api/auth/profile`, `/api/auth/impersonate/:email`, `/api/auth/stop-impersonation`, `/api/students/me`, `/api/students/me/dashboard`. We remove everything else.

- [ ] **Step 1: Rewrite auth.js**

Replace the entire contents of `server/routes/auth.js`. The new file retains the student dashboard endpoints and profile endpoint but removes all password/verification logic.

Key changes:
- Remove `rateLimit`, `jwt`, `bcrypt` requires
- Remove `authLimiter`, `pinLimiter`
- Remove `POST /api/auth/login` — Supabase handles this
- Remove `POST /api/auth/register` — disabled anyway
- Remove `POST /api/auth/request-verification` — magic link replaces this
- Remove `POST /api/auth/verify-pin` — magic link replaces this
- Remove `POST /api/auth/set-initial-password` — no passwords
- Remove `POST /api/auth/change-password` — no passwords
- Keep `GET /api/auth/me` — rewrite to use `req.user` (already set by middleware)
- Keep `POST /api/auth/logout` — updated to also clear impersonation cookie
- Keep `PUT /api/auth/profile` — remove JWT re-issuance, return `{ user }` only
- Rewrite `POST /api/auth/impersonate/:email` — set signed cookie instead of JWT
- Rewrite `POST /api/auth/stop-impersonation` — clear cookie, return admin user

The new file structure:

```js
const supabaseDb = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, getStudioAccessPasses }) {

// ============================================
// AUTH ENDPOINTS
// ============================================

// Get current user info
app.get('/api/auth/me', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  const { data: customer, error } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('id', dbCustomerId)
    .single();

  if (error || !customer) {
    return res.json({ user: req.user });
  }

  const [hasMembership, activeEnrollmentRes] = await Promise.all([
    supabaseDb.hasActiveMembership(customer.id),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', customer.id)
      .in('status', ['active', 'pending'])
      .limit(1)
  ]);
  const hasActiveEnrollments = (activeEnrollmentRes.data || []).length > 0;

  res.json({
    user: {
      customerId: customer.shopify_customer_id,
      dbCustomerId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      mobile: customer.phone,
      dateOfBirth: customer.date_of_birth,
      profilePicture: customer.profile_picture,
      coursePurchaseCount: customer.course_purchase_count || 0,
      classesAllocated: customer.classes_allocated || 0,
      classesUsed: customer.classes_used || 0,
      role: customer.role || 'student',
      isAdmin: req.user.isAdmin || false,
      isImpersonating: req.user.isImpersonating || false,
      impersonatedBy: req.user.impersonatedBy,
      hasMembership,
      hasActiveEnrollments,
      customerType: customer.customer_type || 'student'
    }
  });
}));

// Logout
app.post('/api/auth/logout', (req, res) => {
  // Clear old JWT cookie from pre-migration sessions
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
  // Clear impersonation cookie if present
  res.clearCookie('ves_impersonate', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    signed: true,
  });
  res.json({ success: true });
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { firstName, lastName, email, mobile, dateOfBirth, profilePicture } = req.body;

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required' });
  }

  if (email !== req.user.email) {
    const { data: existingUser } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('email', email)
      .neq('id', dbCustomerId)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }
  }

  const updateData = {
    first_name: firstName,
    last_name: lastName,
    email: email,
    mobile: mobile || null,
    date_of_birth: dateOfBirth || null,
    updated_at: new Date().toISOString()
  };

  if (profilePicture !== undefined) {
    updateData.profile_picture = profilePicture || null;
  }

  const { data: updatedCustomer, error } = await supabaseDb.supabase
    .from('customers')
    .update(updateData)
    .eq('id', dbCustomerId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }

  res.json({
    user: {
      customerId: req.user.customerId,
      dbCustomerId: dbCustomerId,
      email: updatedCustomer.email,
      firstName: updatedCustomer.first_name,
      lastName: updatedCustomer.last_name,
      mobile: updatedCustomer.mobile,
      dateOfBirth: updatedCustomer.date_of_birth,
      profilePicture: updatedCustomer.profile_picture
    }
  });
}));

// ============================================
// IMPERSONATION ENDPOINTS
// ============================================

// Admin impersonation — sets signed cookie
app.post('/api/auth/impersonate/:email', authenticateToken, asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const studentEmail = decodeURIComponent(req.params.email);

  const { data: student, error } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('email', studentEmail)
    .single();

  if (error || !student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Set signed impersonation cookie
  res.cookie('ves_impersonate', String(student.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    path: '/',
    signed: true,
  });

  res.json({
    success: true,
    student: {
      id: student.shopify_customer_id,
      dbId: student.id,
      email: student.email,
      firstName: student.first_name,
      lastName: student.last_name
    }
  });
}));

// Stop impersonation — clears cookie, returns admin user
app.post('/api/auth/stop-impersonation', authenticateToken, asyncHandler(async (req, res) => {
  // Clear the impersonation cookie
  res.clearCookie('ves_impersonate', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    signed: true,
  });

  // Look up admin to return fresh admin user data
  const adminEmail = req.user.impersonatedBy || req.user.email;
  const { data: admin, error } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('email', adminEmail)
    .single();

  if (error || !admin) {
    return res.status(500).json({ error: 'Admin account not found' });
  }

  const [hasMembership, activeEnrollmentRes] = await Promise.all([
    supabaseDb.hasActiveMembership(admin.id),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', admin.id)
      .in('status', ['active', 'pending'])
      .limit(1)
  ]);
  const hasActiveEnrollments = (activeEnrollmentRes.data || []).length > 0;

  res.json({
    success: true,
    user: {
      customerId: admin.shopify_customer_id,
      dbCustomerId: admin.id,
      email: admin.email,
      firstName: admin.first_name,
      lastName: admin.last_name,
      isAdmin: true,
      isImpersonating: false,
      impersonatedBy: null,
      role: admin.role || 'admin',
      hasMembership,
      hasActiveEnrollments,
      customerType: admin.customer_type || 'admin'
    }
  });
}));

// ============================================
// STUDENT ENDPOINTS
// ============================================

// (Keep the existing /api/students/me and /api/students/me/dashboard endpoints
// exactly as they are — copy them from the current auth.js lines ~450-754)

};
```

**Important**: The `/api/students/me` and `/api/students/me/dashboard` endpoints (currently in auth.js around lines 450-754) must be preserved exactly as-is. Copy them into the new file within the module.exports function, after the impersonation endpoints.

- [ ] **Step 2: Verify the student endpoints are preserved**

Run a quick check that the key student endpoints exist in the new file:
```bash
grep -n "api/students/me" server/routes/auth.js
```

Expected: should show both `/api/students/me` and `/api/students/me/dashboard`

- [ ] **Step 3: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: rewrite auth routes for Supabase Auth (remove password/verification, rewrite impersonation)"
```

---

### Task 8: Update frontend impersonation handlers

**Files:**
- Modify: `frontend/src/components/ImpersonationBanner.jsx`
- Modify: `frontend/src/components/Navigation.jsx`

- [ ] **Step 1: Update ImpersonationBanner.jsx**

In `frontend/src/components/ImpersonationBanner.jsx`, find the stop-impersonation handler. It currently calls the API and likely reloads or navigates. Update it to use `updateUser` or `refreshUser` from `useAuth`:

Add `useAuth` import if not present:
```js
import { useAuth } from '../hooks/useAuth';
```

In the component, get `updateUser` from the hook:
```js
const { updateUser } = useAuth();
```

Update the stop handler to use the response data:
```js
const response = await api.post('/auth/stop-impersonation');
if (response.data.user) {
  updateUser(response.data.user);
}
```

This replaces any `window.location.reload()` or token storage logic.

- [ ] **Step 2: Update Navigation.jsx**

Same pattern in `frontend/src/components/Navigation.jsx` (line 115). Find the stop-impersonation call and update it to use `updateUser` with the response data, same as above.

- [ ] **Step 3: Fix Navigation.jsx dead links and fallback**

In `frontend/src/components/Navigation.jsx`:
- Lines 334-339 and 487-493: Remove or change "Sign Up" links pointing to `/register` (route no longer exists). Either remove the links entirely or change to point to `/login`.
- Line 123: Change `window.location.href = '/admin/login'` to `window.location.href = '/login'` in the `handleReturnToAdmin` catch block.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ImpersonationBanner.jsx frontend/src/components/Navigation.jsx
git commit -m "feat: update impersonation handlers to use cookie-based flow"
```

---

### Task 9: Update Account page (remove change password)

**Files:**
- Modify: `frontend/src/pages/Account.jsx`

- [ ] **Step 1: Remove password section from Account.jsx**

In `frontend/src/pages/Account.jsx`:
- Remove the `passwords` state variable (line 86)
- Remove the change password handler function
- Remove the change password form section (the inputs for currentPassword, newPassword, confirmPassword around lines 520-537)
- Remove any reference to the returned `token` from profile update response — the profile endpoint no longer returns a token
- Remove the `security` tab entry from the `tabs` array (around line 283: `{ id: 'security', label: 'Password' }`)
- Remove the entire security tab content section (the password form, around lines 518-557)

- [ ] **Step 2: Update profile save handler**

If the profile save handler stores the returned `token` (from the old `PUT /api/auth/profile` response), remove that logic. The new endpoint returns `{ user }` only.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Account.jsx
git commit -m "feat: remove change password section from Account page"
```

---

### Task 10: Delete old auth pages

**Files:**
- Delete: `frontend/src/pages/VerifyEmail.jsx`
- Delete: `frontend/src/pages/SetupPassword.jsx`
- Delete: `frontend/src/pages/AdminLogin.jsx`
- Delete: `frontend/src/pages/Register.jsx`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/pages/VerifyEmail.jsx
rm frontend/src/pages/SetupPassword.jsx
rm frontend/src/pages/AdminLogin.jsx
rm frontend/src/pages/Register.jsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -rn "VerifyEmail\|SetupPassword\|AdminLogin\|Register" frontend/src/ --include="*.jsx" --include="*.js"
```

Expected: should show NO results (all imports were already removed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/pages/VerifyEmail.jsx frontend/src/pages/SetupPassword.jsx frontend/src/pages/AdminLogin.jsx frontend/src/pages/Register.jsx
git commit -m "chore: delete old auth pages (VerifyEmail, SetupPassword, AdminLogin, Register)"
```

---

### Task 11: Remove unused server dependencies

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Remove bcryptjs and jsonwebtoken**

```bash
cd server && npm uninstall bcryptjs jsonwebtoken
```

- [ ] **Step 2: Verify no remaining usage**

```bash
grep -rn "require.*bcrypt\|require.*jsonwebtoken" server/ --include="*.js" | grep -v node_modules | grep -v package
```

Expected: no results. If any files still import these, they need updating first.

- [ ] **Step 3: Remove unused env vars from documentation**

Note in your commit message that `JWT_SECRET` and `ADMIN_PASSWORD_HASH` env vars are no longer needed. Don't modify `.env` directly (it may be gitignored), but add a note.

- [ ] **Step 4: Commit**

```bash
cd server && git add package.json package-lock.json
git commit -m "chore: remove bcryptjs and jsonwebtoken dependencies (replaced by Supabase Auth)"
```

---

### Deployment Note

All tasks must be deployed together (frontend + backend). After Task 2 (frontend sends Supabase tokens) but before Task 6 (backend accepts them), the app will be broken. Work on a branch and deploy atomically.

---

### Task 12: Smoke test the full flow

This task is manual verification — no code changes.

- [ ] **Step 1: Verify Supabase dashboard config**

In the Supabase dashboard:
1. Auth → Providers → Email: ensure "Enable Email OTP" is on
2. Auth → URL Configuration: set Site URL to `http://localhost:5173` (for local dev)
3. Add `http://localhost:5173/auth/callback` to Redirect URLs

- [ ] **Step 2: Start both servers**

```bash
# Terminal 1
cd server && node index.js

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 3: Test student login flow**

1. Go to `http://localhost:5173/login`
2. Enter a known student email from the `customers` table
3. Verify "Check your email" message appears
4. Check email (or Supabase dashboard → Auth → Users for the magic link)
5. Click magic link → should redirect to `/auth/callback` → then to `/gallery`
6. Verify user data loads correctly (name, classes, etc.)

- [ ] **Step 4: Test admin login flow**

1. Go to `http://localhost:5173/login`
2. Enter `info@ves.sg`
3. Click magic link from email
4. Verify redirect to `/admin`
5. Test impersonation: click impersonate on a student → verify ImpersonationBanner appears
6. Click "Return to Admin" → verify admin view restores

- [ ] **Step 5: Test unknown email**

1. Enter an email that doesn't exist in `customers`
2. Verify the same "Check your email" message appears (no enumeration)
3. Even if they click a magic link, they should be blocked by the backend (401)

- [ ] **Step 6: Test logout**

1. While logged in, click logout
2. Verify redirect to login page
3. Verify protected routes redirect to login
