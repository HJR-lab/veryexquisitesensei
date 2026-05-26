// Calls syncClassInstance on every class_instance with class_date >= today.
// Runs SEQUENTIALLY (no concurrent calls) so the rebuilt descriptions are
// authoritative even before the mutex fix lands in production.
//
// Usage:
//   node scripts/resync-all-future-classes.js
//   node scripts/resync-all-future-classes.js WT2805NT_JL6 WT3005AM_DL7   # filter by base id

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const calendarSync = require('../utils/calendarSync');

const FILTERS = process.argv.slice(2);

(async () => {
  const today = new Date().toISOString().split('T')[0];
  let q = supabase
    .from('class_instances')
    .select('id, class_type, class_date')
    .gte('class_date', today)
    .order('class_date', { ascending: true });

  const { data: rows, error } = await q;
  if (error) throw error;

  let toSync = rows || [];
  if (FILTERS.length > 0) {
    toSync = toSync.filter(r => FILTERS.some(f => (r.class_type || '').startsWith(f)));
  }

  console.log('Resyncing ' + toSync.length + ' class instances (filters: ' + (FILTERS.join(',') || 'none') + ')');
  let ok = 0, fail = 0;
  for (const r of toSync) {
    try {
      await calendarSync.syncClassInstance(r.id);
      ok++;
      if (ok % 10 === 0) process.stdout.write(' [' + ok + '] ');
      else process.stdout.write('.');
    } catch (e) {
      fail++;
      console.log('\n  FAILED ci=' + r.id + ' (' + r.class_type + '): ' + e.message);
    }
  }
  console.log('\nDone. synced=' + ok + ' failed=' + fail);
})();
