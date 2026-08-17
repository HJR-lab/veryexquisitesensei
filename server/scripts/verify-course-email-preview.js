/**
 * Verify: POST /api/admin/course-emails/:courseId/preview renders the real
 * template files and segments recipients exactly the way /send does.
 *
 * Runs the REAL route handlers over HTTP by mounting routes/admin.js into a bare
 * Express app with stubbed auth middleware. Nothing is sent — preview is
 * read-only, and /send is never called here.
 *
 * Guards the reasons the preview exists at all:
 *   1. Preview HTML must equal what /send would build, or the preview lies.
 *   2. A cohort holding a package student must come back as MORE THAN ONE
 *      group — that split is the thing an admin cannot otherwise see.
 *   3. Standalone preview (no recipients) must honour the requested template,
 *      including wt-10class, which /send deliberately coerces away.
 *   4. templateType is interpolated into a require() path, so a traversal
 *      attempt must 400 rather than load an arbitrary module.
 *
 * Run from server/:  node scripts/verify-course-email-preview.js
 */
require('dotenv').config();

const express = require('express');
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

let failures = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function assertOk(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function buildApp(adminEmail) {
  const app = express();
  app.use(express.json());

  const authenticateToken = (req, _res, next) => { req.user = { email: adminEmail, isAdmin: true }; next(); };
  const requireAdmin = (_req, _res, next) => next();
  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('handler error:', err);
      res.status(500).json({ error: err.message });
    });

  require('../routes/admin')(app, { authenticateToken, requireAdmin, asyncHandler });
  return app;
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function post(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer stub' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const FIELDS = {
  dayOfWeek: 'Saturday',
  startDate: '6 Sep',
  endDate: '11 Oct',
  timeSlot: '9:30am – 12pm',
  holidayExclusions: '',
  specialNotes: '',
  collectionStart: '11 Nov',
  collectionEnd: '11 Nov',
  disposalDate: '11 Feb',
};

(async () => {
  const app = buildApp('info@ves.sg');
  const { server, port } = await listen(app);

  try {
    // ── 1. Standalone preview honours the requested package template ────────
    const solo = await post(port, '/api/admin/course-emails/WT0000XX_ZZ6/preview', {
      templateType: 'wt-10class', ...FIELDS,
    });
    assert('standalone preview returns 200', solo.status, 200);
    assert('standalone preview keeps wt-10class (not coerced)',
      solo.body.groups?.[0]?.templateType, 'wt-10class');
    assertOk('standalone preview renders the 10 Class Package subject',
      /10 Class Package/.test(solo.body.groups?.[0]?.subject || ''),
      solo.body.groups?.[0]?.subject);
    // Matched loosely on purpose: the copy gets reworded often, but the 10-class
    // email must always tell the student the remaining classes are theirs to book.
    const soloHtml = solo.body.groups?.[0]?.html || '';
    assertOk('standalone preview tells the student to book the remaining classes',
      /book[^.]*remaining/i.test(soloHtml) && /portal/i.test(soloHtml));

    // ── 2. Unknown / traversal template types are rejected ──────────────────
    const bad = await post(port, '/api/admin/course-emails/WT0000XX_ZZ6/preview', {
      templateType: '../../index', ...FIELDS,
    });
    assert('path traversal templateType is rejected', bad.status, 400);

    const missing = await post(port, '/api/admin/course-emails/WT0000XX_ZZ6/preview', { ...FIELDS });
    assert('missing templateType is rejected', missing.status, 400);

    // ── 3. A real cohort containing a package student splits into groups ────
    const { data: pkg } = await supabase
      .from('course_enrollments')
      .select('course_identifier, package_total_classes, customers(email)')
      .eq('package_total_classes', 10)
      .in('status', ['active', 'pending', 'upcoming'])
      .not('course_identifier', 'is', null)
      .limit(1);

    const pkgEnrollment = (pkg || [])[0];
    if (!pkgEnrollment) {
      console.log('⚠️  no active 10-class package enrollment found — skipping the segmentation check');
    } else {
      const baseId = pkgEnrollment.course_identifier.split('.')[0];
      const { data: peers } = await supabase
        .from('course_enrollments')
        .select('customers(email)')
        .like('course_identifier', `${baseId}%`)
        .in('status', ['active', 'pending', 'upcoming']);

      const emails = [...new Set((peers || []).map(p => p.customers?.email).filter(Boolean))];
      console.log(`\n   cohort ${baseId}: ${emails.length} recipient(s)`);

      const seg = await post(port, `/api/admin/course-emails/${baseId}/preview`, {
        templateType: 'wt-6week', recipientEmails: emails, ...FIELDS,
      });
      assert('cohort preview returns 200', seg.status, 200);

      const types = (seg.body.groups || []).map(g => `${g.templateType}×${g.recipientCount}`);
      console.log(`   groups: ${types.join(', ')}`);
      assertOk('package student is segmented into wt-10class',
        (seg.body.groups || []).some(g => g.templateType === 'wt-10class'),
        types.join(', '));

      const totalRecipients = (seg.body.groups || []).reduce((n, g) => n + g.recipientCount, 0);
      assert('every recipient lands in exactly one group', totalRecipients, emails.length);

      // ── 4. Preview HTML === what send would build for the same group ──────
      // Rebuild independently from the template file and compare byte-for-byte.
      for (const g of seg.body.groups || []) {
        const tpl = require(`../email-templates/courses/${g.templateType}`);
        const built = tpl.generate({
          dayOfWeek: FIELDS.dayOfWeek, startDate: FIELDS.startDate, endDate: FIELDS.endDate,
          timeSlot: FIELDS.timeSlot, holidayExclusions: '', collectionStart: FIELDS.collectionStart,
          collectionEnd: FIELDS.collectionEnd, disposalDate: FIELDS.disposalDate, specialNotes: '',
        });
        assert(`preview HTML matches template output (${g.templateType})`, g.html === built.html, true);
        assert(`preview subject matches template output (${g.templateType})`, g.subject === built.subject, true);
      }
    }
  } finally {
    server.close();
  }

  console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
