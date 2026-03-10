# Lazy Loading Admin Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all admin pages load instantly by showing stats/skeleton first, then lazy-loading the full data list in the background.

**Architecture:** Split each heavy endpoint into a lightweight stats-only endpoint (returns in <200ms) and keep the existing full endpoint for list data. Frontend renders page immediately with stats, then fetches list data in background. No database schema changes.

**Tech Stack:** Express.js backend, React frontend, Supabase PostgreSQL

**Priority order by impact:** AdminStudents (heaviest) → AdminDashboard → AdminClasses → AdminStudioAccess (already light)

---

### Task 1: AdminStudents — Create lightweight stats endpoint

**Files:**
- Modify: `server/index.js` (add new endpoint before existing `/api/admin/students/stats`)

**Step 1: Add `/api/admin/students/stats/summary` endpoint**

This endpoint returns ONLY counts using fast aggregate queries — no student lists.

```javascript
// Lightweight stats summary — just counts, no lists
app.get('/api/admin/students/stats/summary', authenticateToken, async (req, res) => {
  try {
    // Count total customers
    const { count: totalStudents } = await supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    // Count active enrollments
    const { count: activeStudents } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'upcoming']);

    // Count paused
    const { count: pausedStudents } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paused');

    // Count HB enrollments
    const { count: hbStudents } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .ilike('course_type', '%handbuilding%')
      .in('status', ['active', 'upcoming']);

    // Count active memberships
    const { count: activeMembers } = await supabaseDb.supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'expiring']);

    res.json({
      stats: {
        totalStudents: totalStudents || 0,
        activeStudents: activeStudents || 0,
        pausedStudents: pausedStudents || 0,
        hbStudents: hbStudents || 0,
        activeMembers: activeMembers || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching student stats summary:', error);
    res.status(500).json({ error: 'Failed to fetch stats summary' });
  }
});
```

**Step 2: Commit**
```
feat: add lightweight student stats summary endpoint
```

---

### Task 2: AdminStudents — Frontend two-phase loading

**Files:**
- Modify: `frontend/src/pages/AdminStudents.jsx`

**Step 1: Add summary stats state and two-phase fetch**

Replace the single `loadStats()` with two calls:
- `loadSummary()` — instant, sets counts for the header
- `loadFullData()` — background, populates the table

Changes:
1. Add `summaryLoaded` state (boolean, default false)
2. Add `summaryStats` state for the quick counts
3. In useEffect: call `loadSummary()` first, then `loadFullData()`
4. Show page skeleton with counts from summary immediately
5. Show "Loading users…" in the table area while full data loads
6. When full data arrives, populate table as before

Key code pattern:
```javascript
const [summaryStats, setSummaryStats] = useState(null);
const [loading, setLoading] = useState(true); // for full data

useEffect(() => {
  // Phase 1: instant stats
  api.get('/admin/students/stats/summary').then(({ data }) => {
    setSummaryStats(data.stats);
  });
  // Phase 2: full data (background)
  loadStats();
}, []);
```

Render: if `summaryStats` exists but `loading` is true, show the header with counts + "Loading users…" in table body.

**Step 2: Commit**
```
feat: two-phase loading for admin students page
```

---

### Task 3: AdminDashboard — Create lightweight stats endpoint

**Files:**
- Modify: `server/index.js` (add new endpoint)

**Step 1: Add `/api/admin/dashboard/stats/summary` endpoint**

Fast counts only — no joins, no loops, no activity feed.

```javascript
app.get('/api/admin/dashboard/stats/summary', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      { count: totalStudents },
      { count: totalClasses },
      { count: totalBookings },
      { count: activeMemberships },
      { count: galleryPieces },
      { count: pendingStudioAccess },
    ] = await Promise.all([
      supabaseDb.supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabaseDb.supabase.from('class_instances').select('*', { count: 'exact', head: true }).gte('class_date', today),
      supabaseDb.supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['booked', 'attended']),
      supabaseDb.supabase.from('memberships').select('*', { count: 'exact', head: true }).in('status', ['active', 'expiring']),
      supabaseDb.supabase.from('pottery_pieces').select('*', { count: 'exact', head: true }),
      supabaseDb.supabase.from('studio_access_bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    res.json({
      students: { total: totalStudents || 0 },
      classes: { total: totalClasses || 0 },
      bookings: { total: totalBookings || 0 },
      memberships: { total: activeMemberships || 0 },
      gallery: { total: galleryPieces || 0 },
      studioAccess: { pending: pendingStudioAccess || 0 },
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});
```

**Step 2: Commit**
```
feat: add lightweight dashboard stats summary endpoint
```

---

### Task 4: AdminDashboard — Frontend two-phase loading

**Files:**
- Modify: `frontend/src/pages/AdminDashboard.jsx`

**Step 1: Two-phase fetch**

Same pattern as Task 2:
1. Fetch `/admin/dashboard/stats/summary` immediately — render dashboard cards with counts
2. Fetch full `/admin/dashboard/stats` + `/admin/dashboard/activity` in background
3. Cards show real counts instantly, activity feed shows "Loading…" until ready
4. When full stats arrive, update cards with richer data (attendance rates, etc.)

**Step 2: Commit**
```
feat: two-phase loading for admin dashboard
```

---

### Task 5: AdminClasses — Create lightweight stats endpoint

**Files:**
- Modify: `server/index.js`

**Step 1: Add `/api/admin/classes/summary` endpoint**

Returns just course identifiers and counts — no full class instance lists.

```javascript
app.get('/api/admin/classes/summary', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { count: totalClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .gte('class_date', today);

    const { count: wtCourses } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_type', { count: 'exact', head: true })
      .ilike('class_type', 'WT%')
      .gte('class_date', today);

    const { count: hbClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .ilike('class_type', 'HB%')
      .gte('class_date', today);

    res.json({
      totalClasses: totalClasses || 0,
      wtCourses: wtCourses || 0,
      hbClasses: hbClasses || 0,
    });
  } catch (error) {
    console.error('Error fetching classes summary:', error);
    res.status(500).json({ error: 'Failed to fetch classes summary' });
  }
});
```

**Step 2: Commit**
```
feat: add lightweight classes summary endpoint
```

---

### Task 6: AdminClasses — Frontend two-phase loading

**Files:**
- Modify: `frontend/src/pages/AdminClasses.jsx`

**Step 1: Two-phase fetch**

1. Fetch `/admin/classes/summary` — show "X upcoming classes" header immediately
2. Fetch full `/admin/classes` in background — populate calendar and HB cards when ready
3. Calendar area shows loading skeleton until courses arrive

**Step 2: Commit**
```
feat: two-phase loading for admin classes page
```

---

### Task 7: AdminStudioAccess — Add loading skeleton

**Files:**
- Modify: `frontend/src/pages/AdminStudioAccess.jsx`

This page is already light (1 query). Just add a proper loading skeleton so the page structure renders instantly while the single fetch completes. No backend changes needed.

**Step 1: Add skeleton UI**

Show the calendar strip and table header immediately, with a "Loading bookings…" message in the table body while data loads.

**Step 2: Commit**
```
feat: add loading skeleton to admin studio access
```

---

### Task 8: Final commit and push

**Step 1: Verify all pages load with two-phase pattern**
**Step 2: Push to main**

```
git push
```
