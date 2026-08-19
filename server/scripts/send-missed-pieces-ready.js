// One-off backfill: send the pieces-ready email for batches that were marked
// ready while the notification bug was swallowing it.
//
// Between 05/04/26 and 19/08/26 the single and bulk status routes created the
// in-app notification BEFORE sending the email, and notifications.data did not
// exist in prod — so the insert threw and the email line was never reached.
// Fixing the column does not backfill: the batches are already 'ready', so
// nothing re-fires on its own. This pushes them once, through the same
// sendPiecesReady() helper the routes now use.
//
// Dry run (default):  node scripts/send-missed-pieces-ready.js
// Actually send:      node scripts/send-missed-pieces-ready.js --send
require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');
const { sendPiecesReady } = require('../utils/piecesNotifier');
const { publicBaseUrl } = require('../utils/publicUrl');

const BATCH_IDS = [38, 20, 24, 25, 26];
const SEND = process.argv.includes('--send');

(async () => {
  console.log(`Links will point at: ${publicBaseUrl()}`);
  console.log(SEND ? '=== SENDING ===' : '=== DRY RUN (pass --send to send) ===\n');

  for (const id of BATCH_IDS) {
    const batch = await supabaseDb.getPieceBatchById(id);
    if (!batch) { console.log(`batch ${id}: NOT FOUND`); continue; }

    const who = batch.customers
      ? `${batch.customers.first_name || ''} ${batch.customers.last_name || ''}`.trim() + ` <${batch.customers.email}>`
      : 'NO CUSTOMER';

    // Never send twice. Matched on recipient as well as course_identifier: two
    // students in the same cohort share an identifier, so the identifier alone
    // would skip the second one on the strength of the first one's email.
    const { data: sent } = await supabaseDb.supabase
      .from('sent_emails')
      .select('id, sent_at, recipient_emails')
      .eq('email_type', 'pieces-ready')
      .eq('course_identifier', batch.course_enrollments?.course_identifier || `batch-${id}`);

    const already = (sent || []).filter(row =>
      (row.recipient_emails || []).includes(batch.customers?.email)
    );

    if (already.length > 0) {
      console.log(`batch ${id} (${batch.initials}): SKIP — already emailed ${already[0].sent_at?.slice(0, 10)}`);
      continue;
    }

    if (!SEND) {
      console.log(`batch ${id} (${batch.initials}, ${batch.piece_count} pcs, status ${batch.status}): would email ${who}`);
      continue;
    }

    const result = await sendPiecesReady(batch);
    console.log(`batch ${id} (${batch.initials}): emailed=${result.emailed} notified=${result.notified} -> ${who}`);
  }
})().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
