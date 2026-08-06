// READ-ONLY check of package position across every multi-course-package student.
// Uses the shared helper the endpoints now use. Mutates NOTHING.
// Run from server/: node scripts/verify-package-position-fix.js
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { getPackageProgress } = require('../utils/packageProgress');

(async () => {
  const { data: rows } = await supabase
    .from('course_enrollments')
    .select('*')
    .gt('package_total_courses', 1)
    .neq('status', 'cancelled')
    .order('student_id')
    .order('course_start_date');

  const byStudent = {};
  for (const r of rows || []) (byStudent[r.student_id] ||= []).push(r);

  let bad = 0;
  for (const [studentId, enrollments] of Object.entries(byStudent)) {
    const { data: c } = await supabase
      .from('customers').select('first_name, last_name').eq('id', studentId).single();
    console.log(`\n${c.first_name} ${c.last_name} (${studentId})`);
    for (const e of enrollments) {
      const p = await getPackageProgress(supabase, Number(studentId), e);
      const line = `  enr#${e.id} ${e.course_identifier || '—'} ${e.status.padEnd(9)}` +
        ` → Course ${p.current} of ${p.total} · ${p.completed} completed · ${p.remaining} remaining`;
      const ok = p.current >= 1 && p.current <= p.total && p.remaining >= 0 && p.completed >= 0;
      if (!ok) bad++;
      console.log(`${line}${ok ? '' : '   ❌ OUT OF RANGE'}`);
    }
  }
  console.log(`\n${bad === 0 ? 'PASS ✅ every position within 1..total' : `FAIL ❌ ${bad} rows out of range`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
