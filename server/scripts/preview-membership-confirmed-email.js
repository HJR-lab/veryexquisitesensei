// One-off — renders membership-confirmed.js with sample data and emails info@ves.sg
// so it can be previewed in the inbox.
//   node scripts/preview-membership-confirmed-email.js
require('dotenv').config();
const { sendEmail } = require('../utils/emailService');
const { generateMembershipConfirmedEmail } = require('../email-templates/membership-confirmed');

(async () => {
  const { subject, html } = generateMembershipConfirmedEmail({
    firstName: 'Tirza',
    months: 6,
    startDate: '26 May 2026',
    endDate: '26 November 2026',
  });
  console.log('Sending preview to info@ves.sg — subject: ' + subject);
  await sendEmail({ to: 'info@ves.sg', subject: '[PREVIEW] ' + subject, html });
  console.log('Sent.');
})().catch(e => { console.error(e); process.exit(1); });
