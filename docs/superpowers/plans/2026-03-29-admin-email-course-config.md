# Admin Email Management & Course Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded course business rules and email logic with a database-driven admin UI, adding a gear menu to AdminNav with Emails and Courses config pages.

**Architecture:** New `course_config` Supabase table stores per-course-type settings. Backend reads from an in-memory cache (refreshed on admin updates). Two new admin pages provide inline-editable tables. Existing hardcoded constants across ~10 files get replaced with config lookups.

**Tech Stack:** React 18 + Tailwind (frontend), Express.js (backend), Supabase PostgreSQL (DB), Resend (email)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/migrations/course_config.sql` | Table creation + seed data |
| `server/utils/courseConfig.js` | Config cache — load, get, refresh |
| `frontend/src/pages/AdminCourseConfig.jsx` | Courses config inline-editable table |
| `frontend/src/pages/AdminEmails.jsx` | Email settings + compose + history |
| `server/email-templates/reschedule-confirmation.js` | Reschedule confirmation email template |

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/components/AdminNav.jsx` | Add gear icon dropdown |
| `frontend/src/App.jsx` | Add routes `/admin/emails`, `/admin/courses` |
| `server/routes/admin.js` | CRUD endpoints for course_config, reschedule email trigger |
| `server/routes/classes.js` | Reschedule email trigger (student self-reschedule) |
| `server/utils/courseEnrollmentManager.js` | Read from config cache |
| `server/utils/courseScheduler.js` | Read max capacity from config cache |
| `server/utils/cohortAutoProcessor.js` | Read timing/thresholds from config, weekly recheck loop |
| `server/routes/shopify.js` | Check email_auto_send from config |

---

### Task 1: Create `course_config` table and seed data

**Files:**
- Create: `server/migrations/course_config.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Create course_config table
CREATE TABLE IF NOT EXISTS course_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_type_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('wheelthrowing', 'handbuilding')),
  number_of_weeks INTEGER NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 10,
  min_students_to_activate INTEGER NOT NULL DEFAULT 4,
  max_makeups INTEGER NOT NULL DEFAULT 3,
  makeup_fee NUMERIC(10,2) NOT NULL DEFAULT 40.00,
  noshow_fee NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  reschedule_notice_hours INTEGER NOT NULL DEFAULT 24,
  finished_pieces INTEGER NOT NULL DEFAULT 7,
  clay_weight_limit_g INTEGER,
  additional_piece_fee NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  email_auto_send BOOLEAN NOT NULL DEFAULT false,
  email_send_days_before INTEGER NOT NULL DEFAULT 5,
  email_template_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed existing course types
INSERT INTO course_config (course_type_key, display_name, category, number_of_weeks, max_capacity, min_students_to_activate, max_makeups, makeup_fee, noshow_fee, reschedule_notice_hours, finished_pieces, clay_weight_limit_g, additional_piece_fee, email_auto_send, email_send_days_before, email_template_key)
VALUES
  ('wt-6week', 'Wheelthrowing 6-Week', 'wheelthrowing', 6, 10, 4, 3, 40.00, 20.00, 24, 7, NULL, 20.00, false, 5, 'wt-6week'),
  ('wt-7week-inter', 'Wheelthrowing 7-Week Intermediate', 'wheelthrowing', 7, 10, 4, 3, 40.00, 20.00, 24, 8, NULL, 20.00, false, 5, 'wt-7week-inter'),
  ('wt-10class', 'Wheelthrowing 10-Class Package', 'wheelthrowing', 10, 10, 4, 3, 40.00, 20.00, 24, 11, NULL, 20.00, false, 5, 'wt-10class'),
  ('wt-3x6week', 'Wheelthrowing 3-Course Package', 'wheelthrowing', 18, 10, 4, 3, 40.00, 20.00, 24, 21, NULL, 20.00, false, 5, 'wt-3x6week'),
  ('hb-4credit', 'Handbuilding 4-Credit', 'handbuilding', 4, 10, 4, 0, 0.00, 0.00, 24, 5, 3000, 20.00, true, 0, 'hb-4credit'),
  ('hb-8credit', 'Handbuilding 8-Credit', 'handbuilding', 8, 10, 4, 0, 0.00, 0.00, 24, 9, 4500, 20.00, true, 0, 'hb-8credit');

-- Enable RLS
ALTER TABLE course_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated reads
CREATE POLICY "Allow authenticated read" ON course_config
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role all" ON course_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Run migration against Supabase**

Run: `cd server && node -e "const { createClient } = require('@supabase/supabase-js'); const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); const fs = require('fs'); const sql = fs.readFileSync('migrations/course_config.sql', 'utf8'); s.rpc('exec_sql', { sql_text: sql }).then(r => console.log(r))"`

Or run the SQL directly in the Supabase SQL editor.

- [ ] **Step 3: Verify seed data**

Run in Supabase SQL editor: `SELECT course_type_key, display_name, email_auto_send FROM course_config ORDER BY category, course_type_key;`

Expected: 6 rows — 4 wheelthrowing (email_auto_send=false), 2 handbuilding (email_auto_send=true).

- [ ] **Step 4: Commit**

```bash
git add server/migrations/course_config.sql
git commit -m "feat: add course_config table with seed data"
```

---

### Task 2: Create config cache module

**Files:**
- Create: `server/utils/courseConfig.js`

- [ ] **Step 1: Create the config cache module**

```javascript
const supabaseDb = require('./supabaseDb');

let configCache = null;
let cacheLoadedAt = null;

async function loadConfig() {
  const { data, error } = await supabaseDb.supabase
    .from('course_config')
    .select('*')
    .order('category', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    console.error('Failed to load course config:', error);
    throw error;
  }

  configCache = {};
  for (const row of data) {
    configCache[row.course_type_key] = row;
  }
  cacheLoadedAt = new Date();
  console.log(`[CourseConfig] Loaded ${data.length} course configs at ${cacheLoadedAt.toISOString()}`);
  return configCache;
}

function getConfig(courseTypeKey) {
  if (!configCache) {
    throw new Error('Course config not loaded yet. Call loadConfig() on startup.');
  }
  return configCache[courseTypeKey] || null;
}

function getAllConfigs() {
  if (!configCache) {
    throw new Error('Course config not loaded yet. Call loadConfig() on startup.');
  }
  return Object.values(configCache);
}

function getConfigByCategory(category) {
  return getAllConfigs().filter(c => c.category === category);
}

// Call after admin updates a config row
async function refreshConfig() {
  return loadConfig();
}

module.exports = {
  loadConfig,
  getConfig,
  getAllConfigs,
  getConfigByCategory,
  refreshConfig,
};
```

- [ ] **Step 2: Load config on server startup**

In `server/index.js`, find the server startup section (near the bottom where `app.listen` is called). Add before `app.listen`:

```javascript
const courseConfig = require('./utils/courseConfig');

// Inside the startup sequence, before app.listen or in the existing async startup:
await courseConfig.loadConfig();
```

- [ ] **Step 3: Verify startup loads config**

Run: `cd server && npm run dev`
Expected: Console shows `[CourseConfig] Loaded 6 course configs at <timestamp>`

- [ ] **Step 4: Commit**

```bash
git add server/utils/courseConfig.js server/index.js
git commit -m "feat: add course config cache with startup loading"
```

---

### Task 3: Add course config CRUD endpoints

**Files:**
- Modify: `server/routes/admin.js`

- [ ] **Step 1: Add imports at top of admin.js**

Near the existing imports at the top of `server/routes/admin.js`, add:

```javascript
const courseConfig = require('../utils/courseConfig');
```

- [ ] **Step 2: Add GET endpoint for all configs**

Add after the last existing endpoint in admin.js (before `module.exports`):

```javascript
// ── Course Config CRUD ──────────────────────────────────────────────

app.get('/api/admin/course-config', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const configs = courseConfig.getAllConfigs();
  res.json(configs);
}));
```

- [ ] **Step 3: Add PUT endpoint to update a config**

```javascript
app.put('/api/admin/course-config/:key', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { key } = req.params;
  const updates = req.body;

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.course_type_key;
  delete updates.created_at;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseDb.supabase
    .from('course_config')
    .update(updates)
    .eq('course_type_key', key)
    .select()
    .single();

  if (error) throw error;

  // Refresh the in-memory cache
  await courseConfig.refreshConfig();

  res.json(data);
}));
```

- [ ] **Step 4: Add POST endpoint to create a new config**

```javascript
app.post('/api/admin/course-config', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const config = req.body;

  if (!config.course_type_key || !config.display_name || !config.category) {
    return res.status(400).json({ error: 'Missing required fields: course_type_key, display_name, category' });
  }

  config.created_at = new Date().toISOString();
  config.updated_at = new Date().toISOString();

  const { data, error } = await supabaseDb.supabase
    .from('course_config')
    .insert(config)
    .select()
    .single();

  if (error) throw error;

  await courseConfig.refreshConfig();

  res.json(data);
}));
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat: add course config CRUD endpoints"
```

---

### Task 4: Build AdminNav gear dropdown

**Files:**
- Modify: `frontend/src/components/AdminNav.jsx`

- [ ] **Step 1: Add gear dropdown state and UI**

Replace the current AdminNav component. Add `useRef` and `useEffect` imports, a `showSettings` state, and the gear dropdown between the Sync button and Admin badge.

At line 1, update the import:
```javascript
import { useState, useRef, useEffect } from 'react';
```

After the Sync button (after line 84's closing `</button>`), add the gear dropdown:

```javascript
          {/* Settings gear */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                display: 'flex', alignItems: 'center', padding: '2px 6px',
                backgroundColor: 'transparent', border: `1px solid ${RULE}`,
                color: showSettings ? TC : INK, fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>settings</span>
            </button>
            {showSettings && (
              <div
                ref={dropdownRef}
                style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                  backgroundColor: '#FFF', border: `1px solid ${RULE}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 50,
                  minWidth: '120px',
                }}
              >
                <a href="/admin/emails" style={{
                  display: 'block', padding: '8px 14px', fontSize: '11px', fontWeight: 600,
                  color: INK, textDecoration: 'none', letterSpacing: '0.03em',
                }} onMouseEnter={e => e.target.style.backgroundColor = '#F5F5F5'}
                   onMouseLeave={e => e.target.style.backgroundColor = 'transparent'}>
                  Emails
                </a>
                <a href="/admin/courses" style={{
                  display: 'block', padding: '8px 14px', fontSize: '11px', fontWeight: 600,
                  color: INK, textDecoration: 'none', letterSpacing: '0.03em',
                  borderTop: `1px solid ${RULE}`,
                }} onMouseEnter={e => e.target.style.backgroundColor = '#F5F5F5'}
                   onMouseLeave={e => e.target.style.backgroundColor = 'transparent'}>
                  Courses
                </a>
              </div>
            )}
          </div>
```

Add state and ref inside the component function (after existing state declarations):

```javascript
const [showSettings, setShowSettings] = useState(false);
const dropdownRef = useRef(null);

useEffect(() => {
  function handleClickOutside(e) {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
      setShowSettings(false);
    }
  }
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
```

- [ ] **Step 2: Verify gear icon renders**

Run frontend dev server, navigate to `/admin`. Gear icon should appear next to Sync. Click it — dropdown with Emails and Courses links should appear. Click outside — dropdown closes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AdminNav.jsx
git commit -m "feat: add settings gear dropdown with Emails and Courses links"
```

---

### Task 5: Add routes in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add imports for new pages**

Near the other admin page imports in App.jsx, add:

```javascript
import AdminEmails from './pages/AdminEmails';
import AdminCourseConfig from './pages/AdminCourseConfig';
```

- [ ] **Step 2: Add routes inside the admin route group**

Inside the admin `<Route>` group (around line 195-208), add:

```javascript
<Route path="emails" element={<AdminEmails />} />
<Route path="courses" element={<AdminCourseConfig />} />
```

Note: There's an existing route `<Route path="courses" element={<AdminCoursesNew />} />` at approximately line 203. This is a different page (admin course listing). Rename the new config route to avoid collision:

```javascript
<Route path="course-config" element={<AdminCourseConfig />} />
```

And update the gear dropdown link in AdminNav.jsx to `/admin/course-config`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/AdminNav.jsx
git commit -m "feat: add admin routes for emails and course config pages"
```

---

### Task 6: Build Courses Config page

**Files:**
- Create: `frontend/src/pages/AdminCourseConfig.jsx`

- [ ] **Step 1: Create the inline-editable config table page**

```javascript
import { useState, useEffect } from 'react';
import AdminNav from '../components/AdminNav';
import api from '../utils/api';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

const COLUMNS = [
  { key: 'display_name', label: 'Course', type: 'text', width: '180px' },
  { key: 'number_of_weeks', label: 'Weeks', type: 'number', width: '60px' },
  { key: 'max_capacity', label: 'Max Pax', type: 'number', width: '70px' },
  { key: 'min_students_to_activate', label: 'Min to Activate', type: 'number', width: '70px' },
  { key: 'max_makeups', label: 'Makeups', type: 'number', width: '70px' },
  { key: 'makeup_fee', label: 'Makeup Fee', type: 'currency', width: '80px' },
  { key: 'noshow_fee', label: 'No-show Fee', type: 'currency', width: '80px' },
  { key: 'reschedule_notice_hours', label: 'Notice (hrs)', type: 'number', width: '70px' },
  { key: 'finished_pieces', label: 'Pieces', type: 'number', width: '60px' },
  { key: 'clay_weight_limit_g', label: 'Weight (g)', type: 'number', width: '80px' },
  { key: 'additional_piece_fee', label: "Add'l Piece Fee", type: 'currency', width: '80px' },
];

export default function AdminCourseConfig() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState(null); // { key, column }
  const [editValue, setEditValue] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await api.get('/admin/course-config');
      setConfigs(res.data);
    } catch (err) {
      console.error('Failed to load course configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (courseKey, column, currentValue) => {
    setEditingCell({ key: courseKey, column });
    setEditValue(currentValue ?? '');
  };

  const saveEdit = async (courseKey, column) => {
    const config = configs.find(c => c.course_type_key === courseKey);
    const oldValue = config[column];
    let newValue = editValue;

    // Parse numeric types
    const colDef = COLUMNS.find(c => c.key === column);
    if (colDef?.type === 'number') {
      newValue = newValue === '' ? null : parseInt(newValue, 10);
    } else if (colDef?.type === 'currency') {
      newValue = newValue === '' ? null : parseFloat(newValue);
    }

    setEditingCell(null);

    // Skip if unchanged
    if (newValue === oldValue || (newValue === null && oldValue === null)) return;

    try {
      await api.put(`/admin/course-config/${courseKey}`, { [column]: newValue });
      setSaveStatus({ type: 'ok', text: 'Saved' });
      // Update local state
      setConfigs(prev => prev.map(c =>
        c.course_type_key === courseKey ? { ...c, [column]: newValue } : c
      ));
    } catch (err) {
      console.error('Failed to save:', err);
      setSaveStatus({ type: 'err', text: 'Save failed' });
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  const handleKeyDown = (e, courseKey, column) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const formatValue = (value, type) => {
    if (value === null || value === undefined) return '—';
    if (type === 'currency') return `$${Number(value).toFixed(0)}`;
    return String(value);
  };

  const cellStyle = {
    padding: '6px 8px', fontSize: '12px', color: INK,
    borderBottom: `1px solid ${RULE}`, cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const headerStyle = {
    padding: '6px 8px', fontSize: '9px', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: MUTED, borderBottom: `2px solid ${RULE}`,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ fontFamily: "'Atak', sans-serif" }}>
      <AdminNav active="course-config" />
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: INK, margin: 0, letterSpacing: '0.02em' }}>
            Course Configuration
          </h2>
          {saveStatus && (
            <span style={{ fontSize: '11px', fontWeight: 600, color: saveStatus.type === 'ok' ? '#1E6B1E' : '#C0392B' }}>
              {saveStatus.text}
            </span>
          )}
        </div>

        {loading ? (
          <p style={{ fontSize: '12px', color: MUTED }}>Loading...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.key} style={{ ...headerStyle, width: col.width, textAlign: col.type !== 'text' ? 'right' : 'left' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.map(config => (
                  <tr key={config.course_type_key}>
                    {COLUMNS.map(col => {
                      const isEditing = editingCell?.key === config.course_type_key && editingCell?.column === col.key;
                      const isHB = config.category === 'handbuilding';
                      // Skip weight column for WT courses
                      if (col.key === 'clay_weight_limit_g' && !isHB) {
                        return <td key={col.key} style={{ ...cellStyle, color: MUTED, textAlign: 'right' }}>—</td>;
                      }
                      // Skip makeup fields for HB
                      if (['max_makeups', 'makeup_fee', 'noshow_fee'].includes(col.key) && isHB && config[col.key] === 0) {
                        return <td key={col.key} style={{ ...cellStyle, color: MUTED, textAlign: 'right' }}>—</td>;
                      }

                      return (
                        <td
                          key={col.key}
                          style={{
                            ...cellStyle,
                            textAlign: col.type !== 'text' ? 'right' : 'left',
                            backgroundColor: isEditing ? '#FFFBF5' : 'transparent',
                          }}
                          onClick={() => !isEditing && startEdit(config.course_type_key, col.key, config[col.key])}
                        >
                          {isEditing ? (
                            <input
                              type={col.type === 'text' ? 'text' : 'number'}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(config.course_type_key, col.key)}
                              onKeyDown={e => handleKeyDown(e, config.course_type_key, col.key)}
                              autoFocus
                              style={{
                                width: '100%', border: `1px solid ${TC}`, padding: '2px 4px',
                                fontSize: '12px', textAlign: col.type !== 'text' ? 'right' : 'left',
                                outline: 'none', fontFamily: 'inherit',
                              }}
                            />
                          ) : (
                            formatValue(config[col.key], col.type)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Navigate to `/admin/course-config`. Should see a table with 6 rows and all columns. Click any cell to edit. Change a value, blur — should save and show "Saved" status.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminCourseConfig.jsx
git commit -m "feat: add courses config page with inline editing"
```

---

### Task 7: Build Emails management page

**Files:**
- Create: `frontend/src/pages/AdminEmails.jsx`

- [ ] **Step 1: Create the emails page with settings table and compose/history sections**

```javascript
import { useState, useEffect } from 'react';
import AdminNav from '../components/AdminNav';
import api from '../utils/api';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

export default function AdminEmails() {
  const [configs, setConfigs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('settings'); // 'settings' | 'compose' | 'history'
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [draft, setDraft] = useState(null);
  const [sending, setSending] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [configRes, coursesRes, historyRes] = await Promise.all([
        api.get('/admin/course-config'),
        api.get('/admin/course-emails'),
        api.get('/admin/course-emails/history'),
      ]);
      setConfigs(configRes.data);
      setCourses(coursesRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      console.error('Failed to load email data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoSend = async (courseTypeKey, currentValue) => {
    try {
      await api.put(`/admin/course-config/${courseTypeKey}`, { email_auto_send: !currentValue });
      setConfigs(prev => prev.map(c =>
        c.course_type_key === courseTypeKey ? { ...c, email_auto_send: !currentValue } : c
      ));
      setSaveStatus({ type: 'ok', text: 'Saved' });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus({ type: 'err', text: 'Save failed' });
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  const updateDaysBefore = async (courseTypeKey, value) => {
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1) return;
    try {
      await api.put(`/admin/course-config/${courseTypeKey}`, { email_send_days_before: days });
      setConfigs(prev => prev.map(c =>
        c.course_type_key === courseTypeKey ? { ...c, email_send_days_before: days } : c
      ));
    } catch (err) {
      console.error('Failed to update days before:', err);
    }
  };

  const loadDraft = async (courseId) => {
    try {
      const res = await api.get(`/admin/course-emails/${courseId}/draft`);
      setDraft({ ...res.data, selectedEmails: res.data.students.map(s => s.email) });
      setSelectedCourse(courseId);
      setView('compose');
    } catch (err) {
      console.error('Failed to load draft:', err);
    }
  };

  const toggleRecipient = (email) => {
    setDraft(prev => ({
      ...prev,
      selectedEmails: prev.selectedEmails.includes(email)
        ? prev.selectedEmails.filter(e => e !== email)
        : [...prev.selectedEmails, email],
    }));
  };

  const handleSend = async () => {
    if (!draft || draft.selectedEmails.length === 0) return;
    setSending(true);
    try {
      await api.post(`/admin/course-emails/${selectedCourse}/send`, {
        templateType: draft.templateType,
        dayOfWeek: draft.dayOfWeek,
        startDate: draft.startDate,
        endDate: draft.endDate,
        timeSlot: draft.timeSlot,
        holidayExclusions: draft.holidayExclusions || '',
        specialNotes: draft.specialNotes || '',
        collectionStart: draft.collectionStart || '',
        collectionEnd: draft.collectionEnd || '',
        disposalDate: draft.disposalDate || '',
        recipientEmails: draft.selectedEmails,
      });
      setSaveStatus({ type: 'ok', text: 'Email sent!' });
      setView('settings');
      setDraft(null);
      loadAll(); // Refresh history
    } catch (err) {
      setSaveStatus({ type: 'err', text: 'Send failed' });
    } finally {
      setSending(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const headerStyle = {
    padding: '6px 8px', fontSize: '9px', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: MUTED, borderBottom: `2px solid ${RULE}`,
  };
  const cellStyle = {
    padding: '6px 8px', fontSize: '12px', color: INK,
    borderBottom: `1px solid ${RULE}`,
  };

  // Find last sent date for a course type from history
  const getLastSent = (templateKey) => {
    const match = history.find(h => h.course_identifier?.includes(templateKey) || h.email_type === 'course_details');
    return match ? new Date(match.sent_at).toLocaleDateString() : '—';
  };

  if (loading) {
    return (
      <div style={{ fontFamily: "'Atak', sans-serif" }}>
        <AdminNav active="emails" />
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '20px 10px' }}>
          <p style={{ fontSize: '12px', color: MUTED }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Atak', sans-serif" }}>
      <AdminNav active="emails" />
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '20px 10px' }}>
        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: INK, margin: 0 }}>
              {view === 'compose' ? 'Compose Email' : 'Email Management'}
            </h2>
            {view === 'settings' && (
              <button
                onClick={() => setView('history')}
                style={{ fontSize: '10px', fontWeight: 600, color: TC, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                View History
              </button>
            )}
            {(view === 'compose' || view === 'history') && (
              <button
                onClick={() => { setView('settings'); setDraft(null); }}
                style={{ fontSize: '10px', fontWeight: 600, color: TC, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Back to Settings
              </button>
            )}
          </div>
          {saveStatus && (
            <span style={{ fontSize: '11px', fontWeight: 600, color: saveStatus.type === 'ok' ? '#1E6B1E' : '#C0392B' }}>
              {saveStatus.text}
            </span>
          )}
        </div>

        {/* ── Settings view ── */}
        {view === 'settings' && (
          <>
            {/* Email settings table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
              <thead>
                <tr>
                  <th style={{ ...headerStyle, textAlign: 'left' }}>Course</th>
                  <th style={{ ...headerStyle, textAlign: 'center', width: '80px' }}>Auto-send</th>
                  <th style={{ ...headerStyle, textAlign: 'center', width: '100px' }}>Days Before</th>
                  <th style={{ ...headerStyle, textAlign: 'left', width: '120px' }}>Template</th>
                  <th style={{ ...headerStyle, textAlign: 'left', width: '100px' }}>Last Sent</th>
                </tr>
              </thead>
              <tbody>
                {configs.map(config => (
                  <tr key={config.course_type_key}>
                    <td style={cellStyle}>{config.display_name}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={config.email_auto_send}
                        onChange={() => toggleAutoSend(config.course_type_key, config.email_auto_send)}
                        style={{ cursor: 'pointer', accentColor: TC }}
                      />
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {config.email_auto_send && config.category === 'handbuilding' ? (
                        <span style={{ color: MUTED, fontSize: '11px' }}>on purchase</span>
                      ) : config.email_auto_send ? (
                        <input
                          type="number"
                          defaultValue={config.email_send_days_before}
                          onBlur={e => updateDaysBefore(config.course_type_key, e.target.value)}
                          style={{
                            width: '40px', textAlign: 'center', border: `1px solid ${RULE}`,
                            padding: '2px', fontSize: '12px', fontFamily: 'inherit',
                          }}
                        />
                      ) : (
                        <span style={{ color: MUTED, fontSize: '11px' }}>manual</span>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontSize: '11px', color: MUTED }}>{config.email_template_key}</td>
                    <td style={{ ...cellStyle, fontSize: '11px' }}>{getLastSent(config.email_template_key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Upcoming courses needing manual emails */}
            <h3 style={{ fontSize: '12px', fontWeight: 700, color: INK, marginBottom: '8px', letterSpacing: '0.02em' }}>
              Upcoming Courses — Manual Send
            </h3>
            {courses.length === 0 ? (
              <p style={{ fontSize: '12px', color: MUTED }}>No upcoming courses need manual emails.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerStyle, textAlign: 'left' }}>Course</th>
                    <th style={{ ...headerStyle, textAlign: 'left' }}>Start Date</th>
                    <th style={{ ...headerStyle, textAlign: 'center' }}>Students</th>
                    <th style={{ ...headerStyle, textAlign: 'center' }}>Email Sent</th>
                    <th style={{ ...headerStyle, width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map(course => (
                    <tr key={course.courseIdentifier}>
                      <td style={cellStyle}>{course.courseIdentifier}</td>
                      <td style={cellStyle}>{course.startDate || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{course.studentCount}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        {course.emailSentAt ? (
                          <span style={{ color: '#1E6B1E', fontSize: '11px' }}>Sent</span>
                        ) : (
                          <span style={{ color: TC, fontSize: '11px' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => loadDraft(course.courseIdentifier)}
                          style={{
                            fontSize: '10px', fontWeight: 700, padding: '3px 10px',
                            backgroundColor: TC, color: '#FFF', border: 'none',
                            cursor: 'pointer', letterSpacing: '0.04em',
                          }}
                        >
                          Compose
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── Compose view ── */}
        {view === 'compose' && draft && (
          <div>
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#FFFBF5', border: `1px solid ${RULE}` }}>
              <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                <strong>Course:</strong> {draft.courseIdentifier} &nbsp;|&nbsp;
                <strong>Template:</strong> {draft.templateType} &nbsp;|&nbsp;
                <strong>{draft.dayOfWeek}s, {draft.startDate} – {draft.endDate}, {draft.timeSlot}</strong>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Holiday Exclusions
                </label>
                <input
                  type="text"
                  value={draft.holidayExclusions || ''}
                  onChange={e => setDraft(prev => ({ ...prev, holidayExclusions: e.target.value }))}
                  placeholder="e.g., NO CLASS 18 APR GOOD FRIDAY"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Special Notes
                </label>
                <textarea
                  value={draft.specialNotes || ''}
                  onChange={e => setDraft(prev => ({ ...prev, specialNotes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Collection Start</label>
                  <input type="text" value={draft.collectionStart || ''} onChange={e => setDraft(prev => ({ ...prev, collectionStart: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Collection End</label>
                  <input type="text" value={draft.collectionEnd || ''} onChange={e => setDraft(prev => ({ ...prev, collectionEnd: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Disposal Date</label>
                  <input type="text" value={draft.disposalDate || ''} onChange={e => setDraft(prev => ({ ...prev, disposalDate: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>

            {/* Student selection */}
            <h3 style={{ fontSize: '12px', fontWeight: 700, color: INK, marginBottom: '8px' }}>Recipients</h3>
            <div style={{ marginBottom: '16px' }}>
              {draft.students.map(student => (
                <label key={student.email} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draft.selectedEmails.includes(student.email)}
                    onChange={() => toggleRecipient(student.email)}
                    style={{ accentColor: TC }}
                  />
                  {student.firstName} {student.lastName} — <span style={{ color: MUTED }}>{student.email}</span>
                </label>
              ))}
            </div>

            <button
              onClick={handleSend}
              disabled={sending || draft.selectedEmails.length === 0}
              style={{
                fontSize: '11px', fontWeight: 700, padding: '8px 24px',
                backgroundColor: sending ? MUTED : TC, color: '#FFF',
                border: 'none', cursor: sending ? 'default' : 'pointer',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >
              {sending ? 'Sending…' : `Send to ${draft.selectedEmails.length} student${draft.selectedEmails.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* ── History view ── */}
        {view === 'history' && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...headerStyle, textAlign: 'left' }}>Date</th>
                  <th style={{ ...headerStyle, textAlign: 'left' }}>Type</th>
                  <th style={{ ...headerStyle, textAlign: 'left' }}>Course</th>
                  <th style={{ ...headerStyle, textAlign: 'left' }}>Subject</th>
                  <th style={{ ...headerStyle, textAlign: 'center' }}>Recipients</th>
                  <th style={{ ...headerStyle, textAlign: 'left' }}>Sent By</th>
                </tr>
              </thead>
              <tbody>
                {history.map(entry => (
                  <tr key={entry.id}>
                    <td style={cellStyle}>{new Date(entry.sent_at).toLocaleDateString()}</td>
                    <td style={cellStyle}>{entry.email_type}</td>
                    <td style={cellStyle}>{entry.course_identifier || '—'}</td>
                    <td style={{ ...cellStyle, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.subject}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{entry.recipient_count}</td>
                    <td style={cellStyle}>{entry.sent_by === 'system' ? 'Auto' : entry.sent_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && (
              <p style={{ fontSize: '12px', color: MUTED, marginTop: '8px' }}>No emails sent yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Navigate to `/admin/emails`. Should see email settings table with checkboxes, upcoming manual courses, and a history link.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminEmails.jsx
git commit -m "feat: add emails management page with settings, compose, and history"
```

---

### Task 8: Create reschedule confirmation email template

**Files:**
- Create: `server/email-templates/reschedule-confirmation.js`

- [ ] **Step 1: Create the template**

```javascript
const { wrapEmailTemplate } = require('./base');

function generate({ firstName, originalDate, newDate, newTime, courseIdentifier }) {
  const body = `
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
        Dear ${firstName},
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
        Your class has been rescheduled. Here are the updated details:
      </p>

      <div style="background-color: #FFFBF5; border: 1px solid rgba(40,40,40,0.09); padding: 16px 20px; margin: 0 0 20px;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #888888;">
          <strong style="color: #282828;">Original class:</strong> ${originalDate}
        </p>
        <p style="margin: 0; font-size: 13px; color: #888888;">
          <strong style="color: #282828;">New makeup class:</strong> ${newDate}, ${newTime}
        </p>
      </div>

      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
        Please arrive 10 minutes early to set up your workspace. If you need to reschedule again, please do so at least 24 hours in advance.
      </p>

      <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
        <strong>Studio address:</strong>
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #282828;">
        75 Jalan Kelabu Asap, Singapore 278257
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="https://club.ves.sg/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
          View Your Bookings
        </a>
      </div>
    </div>
  `;

  return {
    subject: `VES: Class Rescheduled — ${newDate}`,
    html: wrapEmailTemplate(body),
  };
}

module.exports = { generate };
```

- [ ] **Step 2: Commit**

```bash
git add server/email-templates/reschedule-confirmation.js
git commit -m "feat: add reschedule confirmation email template"
```

---

### Task 9: Wire reschedule email into both reschedule endpoints

**Files:**
- Modify: `server/routes/admin.js` (admin reschedule at line 3651)
- Modify: `server/routes/classes.js` (student self-reschedule at line 840)

- [ ] **Step 1: Add reschedule email to admin reschedule endpoint**

In `server/routes/admin.js`, at the end of the admin reschedule handler (after `res.json` at line 3755), add email sending logic just before the response. Replace the `res.json` line:

Find at line 3755:
```javascript
  res.json({ message: 'Booking rescheduled successfully', newBooking });
```

Replace with:
```javascript
  // Send reschedule confirmation email
  try {
    const { data: student } = await supabaseDb.supabase
      .from('customers')
      .select('first_name, email')
      .eq('id', originalBooking.student_id)
      .single();

    const { data: newClassInstance } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_date, start_time, end_time')
      .eq('id', newClassInstanceId)
      .single();

    if (student?.email && newClassInstance) {
      const rescheduleTemplate = require('../email-templates/reschedule-confirmation');
      const { sendAndLogEmail } = require('../utils/emailService');
      const originalDate = originalBooking.class_instances?.class_date
        ? new Date(originalBooking.class_instances.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        : 'your original class';
      const newDate = new Date(newClassInstance.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const newTime = `${newClassInstance.start_time} – ${newClassInstance.end_time}`;

      const { subject, html } = rescheduleTemplate.generate({
        firstName: student.first_name || 'Student',
        originalDate,
        newDate,
        newTime,
        courseIdentifier: originalBooking.course_enrollment_id || '',
      });

      await sendAndLogEmail({
        emailType: 'reschedule_confirmation',
        courseIdentifier: originalBooking.course_enrollment_id || 'N/A',
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
    }
  } catch (emailErr) {
    console.error('Failed to send reschedule confirmation email:', emailErr);
    // Don't fail the reschedule if email fails
  }

  res.json({ message: 'Booking rescheduled successfully', newBooking });
```

- [ ] **Step 2: Add reschedule email to student self-reschedule endpoint**

In `server/routes/classes.js`, find the student reschedule endpoint at line 840. Locate the success response (search for `res.json` with `rescheduleFee` in the response). Add the email logic before the response, following the same pattern as above but using `req.user` for the student info:

Find the success `res.json` near the end of the `/api/classes/reschedule` handler and add before it:

```javascript
  // Send reschedule confirmation email
  try {
    const { data: student } = await supabaseDb.supabase
      .from('customers')
      .select('first_name, email')
      .eq('id', req.user.customerId || oldBooking.student_id)
      .single();

    const { data: newClassInfo } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_date, start_time, end_time')
      .eq('id', newClassInstanceId)
      .single();

    if (student?.email && newClassInfo) {
      const rescheduleTemplate = require('../email-templates/reschedule-confirmation');
      const { sendAndLogEmail } = require('../utils/emailService');
      const originalDate = oldBooking.class_instances?.class_date
        ? new Date(oldBooking.class_instances.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        : 'your original class';
      const newDate = new Date(newClassInfo.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const newTime = `${newClassInfo.start_time} – ${newClassInfo.end_time}`;

      const { subject, html } = rescheduleTemplate.generate({
        firstName: student.first_name || 'Student',
        originalDate,
        newDate,
        newTime,
        courseIdentifier: oldBooking.course_enrollment_id || '',
      });

      await sendAndLogEmail({
        emailType: 'reschedule_confirmation',
        courseIdentifier: oldBooking.course_enrollment_id || 'N/A',
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
    }
  } catch (emailErr) {
    console.error('Failed to send reschedule confirmation email:', emailErr);
  }
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin.js server/routes/classes.js
git commit -m "feat: send reschedule confirmation email on both admin and student reschedule"
```

---

### Task 10: Refactor backend to read from config cache

**Files:**
- Modify: `server/utils/courseEnrollmentManager.js`
- Modify: `server/utils/courseScheduler.js`
- Modify: `server/utils/cohortAutoProcessor.js`
- Modify: `server/routes/shopify.js`

- [ ] **Step 1: Refactor courseEnrollmentManager.js**

At the top (line 18), replace the hardcoded constant:

```javascript
// OLD:
const MINIMUM_STUDENTS_THRESHOLD = 4;
```

```javascript
// NEW:
const courseConfig = require('./courseConfig');

function getMinStudentsThreshold(courseTypeKey) {
  const config = courseConfig.getConfig(courseTypeKey);
  return config ? config.min_students_to_activate : 4; // fallback to 4
}
```

At line 488, replace hardcoded `maxCapacity: 10`:

```javascript
// OLD:
maxCapacity: 10,
```

```javascript
// NEW:
maxCapacity: (courseConfig.getConfig(templateKey) || {}).max_capacity || 10,
```

Where `MINIMUM_STUDENTS_THRESHOLD` is used in comparisons (search for it throughout the file), replace with `getMinStudentsThreshold(courseTypeKey)` passing the appropriate key from context.

- [ ] **Step 2: Refactor courseScheduler.js**

At line 322, replace the hardcoded default:

```javascript
// OLD:
maxCapacity: 10,
```

```javascript
// NEW:
const courseConfig = require('./courseConfig');
// ... inside createClassInstances:
maxCapacity: (courseConfig.getConfig(courseInfo.templateKey) || {}).max_capacity || 10,
```

- [ ] **Step 3: Refactor cohortAutoProcessor.js — timing and weekly recheck**

Import config at the top:
```javascript
const courseConfig = require('./courseConfig');
```

In `checkCourseEmailReminders()` (line 213-216), replace hardcoded 5-day calculation:

```javascript
// OLD:
const targetDate = new Date(now);
targetDate.setDate(targetDate.getDate() + 5);
```

```javascript
// NEW: Check each course's configured days_before
const allConfigs = courseConfig.getAllConfigs();
// For each WT config, calculate its target date based on email_send_days_before
```

Add the weekly recheck loop logic in the daily 2 AM processor. After `checkCourseEmailReminders()`, add:

```javascript
async function checkWeeklyUnconfirmedRecheck() {
  const allConfigs = courseConfig.getConfigByCategory('wheelthrowing');

  for (const config of allConfigs) {
    if (!config.email_auto_send) continue;

    // Find courses that have had unconfirmed emails sent but no confirmation yet
    const { data: unconfirmedSends } = await supabaseDb.supabase
      .from('sent_emails')
      .select('*')
      .eq('email_type', 'course_unconfirmed')
      .order('sent_at', { ascending: false });

    if (!unconfirmedSends) continue;

    for (const send of unconfirmedSends) {
      // Check if confirmation was already sent for this course
      const { data: confirmationSent } = await supabaseDb.supabase
        .from('sent_emails')
        .select('id')
        .eq('email_type', 'course_details')
        .eq('course_identifier', send.course_identifier)
        .limit(1);

      if (confirmationSent && confirmationSent.length > 0) continue; // Already confirmed

      // Check if 7 days since last unconfirmed email
      const daysSinceLastSend = Math.floor((Date.now() - new Date(send.sent_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastSend < 7) continue;

      // Check current enrollment count
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .like('course_identifier', `${send.course_identifier}%`)
        .in('status', ['active', 'pending', 'upcoming']);

      const enrollmentCount = enrollments ? enrollments.length : 0;
      const minStudents = config.min_students_to_activate;

      if (enrollmentCount >= minStudents) {
        // Course now confirmed! Send confirmation email
        console.log(`[AutoProcessor] Course ${send.course_identifier} reached ${enrollmentCount} pax — sending confirmation`);
        // Trigger confirmation email send (reuse existing course email logic)
      } else {
        // Still unconfirmed — resend unconfirmed email
        console.log(`[AutoProcessor] Course ${send.course_identifier} still at ${enrollmentCount}/${minStudents} pax — resending unconfirmed`);
        // Trigger unconfirmed email resend
      }
    }
  }
}
```

Add `checkWeeklyUnconfirmedRecheck()` to the daily 2 AM run.

- [ ] **Step 4: Refactor shopify.js — check auto-send config**

In the Shopify order webhook handler (around line 1158), where HB emails are auto-sent, wrap with a config check:

```javascript
// OLD: Always sends HB email on purchase
const template = detectCourseTemplate(enrollment);
// ... send email

// NEW: Only send if email_auto_send is true for this course type
const courseConfig = require('../utils/courseConfig');
const templateKey = detectCourseTemplate(enrollment);
const config = courseConfig.getConfig(templateKey);
if (config && config.email_auto_send) {
  // ... send email (existing logic)
} else {
  console.log(`[Shopify] Skipping auto-email for ${templateKey} — auto-send disabled`);
}
```

- [ ] **Step 5: Commit**

```bash
git add server/utils/courseEnrollmentManager.js server/utils/courseScheduler.js server/utils/cohortAutoProcessor.js server/routes/shopify.js
git commit -m "refactor: replace hardcoded course constants with config cache lookups"
```

---

### Task 11: Delete old AdminCourseEmails page

**Files:**
- Delete: `frontend/src/pages/AdminCourseEmails.jsx`
- Modify: `frontend/src/App.jsx` (remove old import/route if any)

- [ ] **Step 1: Remove old page and any references**

```bash
rm frontend/src/pages/AdminCourseEmails.jsx
```

Search App.jsx for any remaining `AdminCourseEmails` import or route and remove it.

- [ ] **Step 2: Commit**

```bash
git add -u frontend/src/pages/AdminCourseEmails.jsx frontend/src/App.jsx
git commit -m "chore: remove old AdminCourseEmails page (replaced by AdminEmails)"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Start local servers**

```bash
cd server && npm run dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Verify gear dropdown**

Navigate to `localhost:5173/admin`. Click gear icon — should show Emails and Courses dropdown.

- [ ] **Step 3: Verify Course Config page**

Navigate to `/admin/course-config`. Verify:
- 6 course types displayed in table
- Click a cell, edit, blur → saves to DB
- Weight column shows "—" for WT courses

- [ ] **Step 4: Verify Emails page**

Navigate to `/admin/emails`. Verify:
- Email settings table with auto-send toggles
- Toggle HB auto-send off and on — saves
- "Days Before" editable for WT when auto-send is on
- Upcoming manual courses listed
- Compose flow works
- History view shows past emails

- [ ] **Step 5: Verify reschedule email**

Trigger a reschedule via admin panel. Check `sent_emails` table for a new `reschedule_confirmation` record.

- [ ] **Step 6: Verify config cache refresh**

Change a value on Course Config page. Check server logs for `[CourseConfig] Loaded X course configs`. Verify the new value is used by the system.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete admin email management and course configuration system"
```
