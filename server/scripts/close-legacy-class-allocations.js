/**
 * Close the December-2025 import's leftover class allocations.
 *
 * 362 customers were created in the initial Shopify import on 2025-12-27 with a
 * classes_allocated figure but no course_enrollments row of any kind. Their
 * purchases all predate the import (Apr–Dec 2025), none has bought since, and
 * only two ever had a booking — their classes happened before this system
 * existed, so the figure is a leftover, not an entitlement.
 *
 * Booking eligibility no longer reads classes_allocated at all (see
 * getBookableCredits), so this does not change what anyone can book. It clears
 * the column so it stops advertising classes nobody is owed.
 *
 * Broader than scripts/clear-phantom-class-allocations.js, which deliberately
 * spared records with a purchase count or a non-default allocation. Justin
 * confirmed on 18/08/26 that all of them, including the 16 with the purchased
 * shapes of 10 and 12, are completed students.
 *
 *   node scripts/close-legacy-class-allocations.js            # dry run
 *   node scripts/close-legacy-class-allocations.js --apply
 */
require('dotenv').config();
const fs = require('fs');
const { supabase } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');
const BACKUP = `${__dirname}/backup-legacy-class-allocations.json`;

(async () => {
  const { data: cs } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, classes_allocated, course_purchase_count, created_at')
    .gt('classes_allocated', 0);

  const targets = [];
  for (const c of cs) {
    const { data: es } = await supabase
      .from('course_enrollments').select('id').eq('student_id', c.id);
    if (es && es.length) continue;              // has an enrollment — not ours to touch
    const { data: bk } = await supabase
      .from('bookings').select('id').eq('student_id', c.id);
    targets.push({ ...c, bookings: (bk || []).length });
  }

  const total = targets.reduce((s, t) => s + (t.classes_allocated || 0), 0);
  console.log(`customers to close: ${targets.length}`);
  console.log(`phantom classes cleared: ${total}`);
  console.log(`  default 6: ${targets.filter(t => t.classes_allocated === 6).length}`);
  console.log(`  purchased shapes (10/12): ${targets.filter(t => t.classes_allocated !== 6).length}`);
  console.log(`  with bookings on record: ${targets.filter(t => t.bookings > 0).length}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write.');
    return;
  }

  // Reversible: every prior value is recorded before anything is written.
  fs.writeFileSync(BACKUP, JSON.stringify(targets, null, 2));
  console.log(`\nbackup written: ${BACKUP}`);

  let done = 0;
  for (const t of targets) {
    const { error } = await supabase
      .from('customers')
      .update({ classes_allocated: 0 })
      .eq('id', t.id);
    if (error) { console.error(`  FAILED #${t.id}:`, error.message); continue; }
    done++;
  }
  console.log(`closed ${done}/${targets.length}`);
})();
