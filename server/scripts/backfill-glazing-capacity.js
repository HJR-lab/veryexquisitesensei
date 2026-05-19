// Backfill: future glazing (final-week) class_instances max_capacity -> 14
// Glazing = class_type matching <totalWeeks>.<weekNum>$ where weekNum === totalWeeks
// Scope: class_date >= today (Asia/Singapore), max_capacity < 14. READ then WRITE.
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const GLAZING_TARGET = 14;

function isGlazing(classType) {
  if (!classType || typeof classType !== 'string') return false;
  const m = classType.match(/(\d+)\.(\d+)$/); // e.g. ..._JL6.6 -> ["6.6","6","6"]
  if (!m) return false;
  return m[1] === m[2]; // final week (week# === total weeks)
}

(async () => {
  // Today's date in Singapore (class_date is stored as YYYY-MM-DD in SGT)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD

  const { data: rows, error } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, max_capacity, status')
    .gte('class_date', todayStr)
    .order('class_date', { ascending: true });

  if (error) { console.error('query error:', error); process.exit(1); }

  const glazing = (rows || []).filter(r => isGlazing(r.class_type));
  const toUpdate = glazing.filter(r => (r.max_capacity || 0) < GLAZING_TARGET);

  console.log(`Today (SGT): ${todayStr}`);
  console.log(`Future class_instances: ${rows?.length || 0}`);
  console.log(`Future glazing classes: ${glazing.length}`);
  console.log(`Glazing classes below ${GLAZING_TARGET} (will update): ${toUpdate.length}\n`);

  for (const r of toUpdate) {
    console.log(`  #${r.id}  ${r.class_date}  ${r.class_type}  ${r.max_capacity} -> ${GLAZING_TARGET}  [${r.status}]`);
  }

  if (toUpdate.length === 0) { console.log('\nNothing to update.'); process.exit(0); }

  const ids = toUpdate.map(r => r.id);
  const { data: updated, error: updErr } = await supabase
    .from('class_instances')
    .update({ max_capacity: GLAZING_TARGET, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id, class_date, class_type, max_capacity');

  if (updErr) { console.error('\nUPDATE error:', updErr); process.exit(1); }

  console.log(`\n✅ Updated ${updated?.length || 0} rows to max_capacity=${GLAZING_TARGET}.`);
  // Spot-check the reported May 26 class
  const may26 = (updated || []).find(u => u.class_date === '2026-05-26');
  if (may26) console.log(`   May 26 verified: #${may26.id} ${may26.class_type} now max_capacity=${may26.max_capacity}`);
  process.exit(0);
})();
