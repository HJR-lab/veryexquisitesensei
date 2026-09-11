// Live, self-cleaning verification that the admin capacity-override routes can
// still use the service-role-only table. Run from server/ with production DB env.
require('dotenv').config();

const express = require('express');
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

function buildApp() {
  const app = express();
  app.use(express.json());
  const authenticateToken = (req, _res, next) => {
    req.user = { email: 'deus-security-verification', isAdmin: true };
    next();
  };
  const requireAdmin = (_req, _res, next) => next();
  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  require('../routes/admin')(app, { authenticateToken, requireAdmin, asyncHandler });
  return app;
}

(async () => {
  let createdId;
  let server;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: classes, error: classError } = await supabase
      .from('class_instances').select('id').gte('class_date', today).order('class_date').limit(20);
    if (classError) throw classError;
    const { data: students, error: studentError } = await supabase
      .from('customers').select('id').order('id').limit(20);
    if (studentError) throw studentError;

    let pair;
    for (const cls of classes || []) {
      for (const student of students || []) {
        const { data } = await supabase.from('capacity_overrides').select('id')
          .eq('class_instance_id', cls.id).eq('student_id', student.id).is('revoked_at', null).maybeSingle();
        if (!data) { pair = { cls, student }; break; }
      }
      if (pair) break;
    }
    if (!pair) throw new Error('no unused class/student pair found');

    const app = buildApp();
    server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, route, body) => {
      const response = await fetch(`${base}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };

    const created = await call('POST', `/api/admin/classes/${pair.cls.id}/capacity-override`, {
      studentId: pair.student.id,
      reason: 'RLS SERVICE-ROLE VERIFICATION — SAFE TO DELETE',
    });
    if (created.status !== 200) throw new Error(`grant route returned ${created.status}: ${JSON.stringify(created.body)}`);
    createdId = created.body.override.id;

    const listed = await call('GET', `/api/admin/classes/${pair.cls.id}/capacity-overrides`);
    if (listed.status !== 200 || !listed.body.overrides.some((row) => row.id === createdId)) {
      throw new Error(`list route omitted created grant ${createdId}`);
    }

    const withdrawn = await call('DELETE', `/api/admin/capacity-overrides/${createdId}`);
    if (withdrawn.status !== 200) throw new Error(`withdraw route returned ${withdrawn.status}`);
    const activeAfter = await supabaseDb.findCapacityOverride(pair.cls.id, pair.student.id);
    if (activeAfter) throw new Error('withdrawn grant remained active');

    console.log(`PASS capacity override admin flow: granted, listed, withdrew id ${createdId}`);
  } finally {
    if (server) server.close();
    if (createdId) {
      const { error } = await supabase.from('capacity_overrides').delete().eq('id', createdId);
      if (error) throw error;
      console.log(`PASS cleanup: deleted verification override ${createdId}`);
    }
  }
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exitCode = 1;
});
