/**
 * Send the +1 onboarding (welcome + HB course details) to a second-spot student
 * whose details form was completed before onboarding existed.
 *
 *   node scripts/send-plus-one-onboarding.js <customerId>          # dry run: renders to /tmp, sends nothing
 *   node scripts/send-plus-one-onboarding.js <customerId> --send   # really sends
 *
 * Only customers with a COMPLETED student_detail_requests row are accepted.
 */
require('dotenv').config({ path: __dirname + '/../.env' });

const customerId = Number(process.argv[2]);
const send = process.argv.includes('--send');

(async () => {
  if (!customerId) {
    console.error('Usage: node scripts/send-plus-one-onboarding.js <customerId> [--send]');
    process.exit(1);
  }
  const { supabase } = require('../utils/supabaseDb');
  const { data: request } = await supabase
    .from('student_detail_requests')
    .select('*')
    .eq('placeholder_customer_id', customerId)
    .eq('status', 'completed')
    .maybeSingle();
  if (!request) {
    console.error(`No completed student-details request for customer ${customerId}`);
    process.exit(1);
  }

  if (!send) {
    // Dry run: capture what would be sent instead of sending it
    const emailService = require('../utils/emailService');
    const fs = require('fs');
    let n = 0;
    const capture = async ({ subject, html, recipientEmails, to }) => {
      const file = `/tmp/plus-one-onboarding-${customerId}-${++n}.html`;
      fs.writeFileSync(file, html);
      console.log(`[DRY RUN] would send "${subject}" to ${JSON.stringify(recipientEmails || to)} → ${file}`);
      return { success: true };
    };
    emailService.sendAndLogEmail = capture;
    emailService.sendEmail = capture;
  }

  const { sendPlusOneOnboarding } = require('../utils/studentOnboarding');
  const summary = await sendPlusOneOnboarding({ customerId, purchaserEmail: request.purchaser_email });
  console.log(send ? 'SENT' : 'DRY RUN', JSON.stringify(summary));
  process.exit(summary.errors.length ? 1 : 0);
})();
