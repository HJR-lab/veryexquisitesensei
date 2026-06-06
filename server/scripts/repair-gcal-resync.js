// One-time repair: re-sync all upcoming class_instances to Google Calendar so
// the calendar matches the DB (fixes date-drift left by un-synced postpones and
// refreshes student lists). Idempotent — safe to run repeatedly.
// syncClassInstance only touches today/future classes and updates existing
// events in place (it does not create duplicates for rows that already have an
// event id).
//
// Run from server/:  node scripts/repair-gcal-resync.js
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const calendarSync = require('../utils/calendarSync');

(async () => {
  if (!calendarSync.isEnabled()) {
    console.log('Calendar sync disabled (no refresh token). Aborting.');
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date')
    .gte('class_date', today)
    .order('class_date', { ascending: true });
  if (error) { console.error('Query failed:', error.message); process.exit(1); }

  console.log(`Re-syncing ${classes.length} upcoming class instances...`);
  let done = 0;
  for (const ci of classes) {
    // await so the process doesn't exit before the Google API call completes
    await calendarSync.syncClassInstance(ci.id);
    done++;
    if (done % 10 === 0) console.log(`  ...${done}/${classes.length}`);
  }
  console.log(`Done. Re-synced ${done} class instances.`);
})();
