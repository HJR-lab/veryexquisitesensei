// Backfill: weeks 4 and 5 of every 6-week WT cohort get their third make-up
// seat — max_capacity 10 -> 11.
//
// Those two weeks are trimming, which needs much less instructor attention than
// throwing, so an eleventh student fits the teaching load. The rule itself lives
// in config/capacity.js (WT_EXTRA_MAKEUP_WEEKS / WT_EXTRA_ROOM_CAP) and the
// booking gate derives it whether or not the column is right — this script only
// brings the stored column into agreement so rosters and capacity readouts show
// the same number the gate enforces.
//
// Scope: ALL 6.4 / 6.5 class_instances, past and future. Rows already at or
// above the target are left alone. Pass --apply to write; default is a dry run.
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { hasExtraMakeupSeat, roomCapacity, WT_EXTRA_ROOM_CAP } = require('../config/capacity');

const APPLY = process.argv.includes('--apply');

(async () => {
  const { data: rows, error } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, max_capacity, status')
    .like('class_type', 'WT%')
    .order('class_date', { ascending: true });

  if (error) { console.error('query error:', error); process.exit(1); }

  const targets = (rows || []).filter(r => hasExtraMakeupSeat(r.class_type));
  const toUpdate = targets.filter(r => (r.max_capacity || 0) < WT_EXTRA_ROOM_CAP);

  console.log(`WT class_instances scanned:        ${rows?.length || 0}`);
  console.log(`6-week WT weeks 4 & 5 (6.4 / 6.5): ${targets.length}`);
  console.log(`Below ${WT_EXTRA_ROOM_CAP} (will update):            ${toUpdate.length}\n`);

  for (const r of toUpdate) {
    console.log(`  #${r.id}  ${r.class_date}  ${r.class_type}  ${r.max_capacity} -> ${roomCapacity(r)}  [${r.status}]`);
  }

  // Anything already wider than the target — a hand-raised class — is reported
  // rather than pulled back down to 11.
  const wider = targets.filter(r => (r.max_capacity || 0) > WT_EXTRA_ROOM_CAP);
  if (wider.length) {
    console.log(`\nLeft alone (already wider than ${WT_EXTRA_ROOM_CAP}):`);
    for (const r of wider) console.log(`  #${r.id}  ${r.class_date}  ${r.class_type}  max_capacity=${r.max_capacity}`);
  }

  if (toUpdate.length === 0) { console.log('\nNothing to update.'); process.exit(0); }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to update ${toUpdate.length} rows.`);
    process.exit(0);
  }

  const ids = toUpdate.map(r => r.id);
  const { data: updated, error: updErr } = await supabase
    .from('class_instances')
    .update({ max_capacity: WT_EXTRA_ROOM_CAP, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id, class_date, class_type, max_capacity');

  if (updErr) { console.error('\nUPDATE error:', updErr); process.exit(1); }

  console.log(`\n✅ Updated ${updated?.length || 0} rows to max_capacity=${WT_EXTRA_ROOM_CAP}.`);
  process.exit(0);
})();
