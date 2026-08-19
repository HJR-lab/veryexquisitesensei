// Verify notifications.data exists and that createNotification() — the call that
// used to throw PGRST204 and take the pieces-ready email down with it — now
// round-trips. Inserts one notification and deletes it again; leaves no rows.
//
// Run from server/:  node scripts/verify-notifications-data-column.js
require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

(async () => {
  const { error: colError } = await supabase.from('notifications').select('data').limit(1);
  console.log('column notifications.data:', colError ? 'MISSING — ' + colError.message : 'present');
  if (colError) process.exit(1);

  // Round-trip through the real code path, with a payload shaped like the
  // pieces-ready one (a JSONB object is what used to fail).
  const created = await supabaseDb.createNotification({
    customerId: 2569,
    type: 'verification_probe',
    title: 'Verification probe',
    message: 'Written and deleted by verify-notifications-data-column.js',
    data: { probe: true, batchId: 0, pieceCount: 0 },
  });
  console.log('createNotification OK — id', created.id, 'data', JSON.stringify(created.data));

  await supabase.from('notifications').delete().eq('id', created.id);
  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true });
  console.log('probe deleted; notifications row count now:', count);
})().catch((e) => {
  console.error('Verification failed:', e.message);
  process.exit(1);
});
