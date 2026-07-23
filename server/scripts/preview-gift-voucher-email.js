#!/usr/bin/env node
// Send a test render of the gift-voucher email to the studio inbox.
// Usage: node scripts/preview-gift-voucher-email.js [to@email]
require('dotenv').config();
const { sendEmail } = require('../utils/emailService');
const { generateGiftVoucherEmail } = require('../email-templates/gift-voucher');

const giverMessage = `Dear Vera, Happy 5th birthday!
May you keep growing wiser every day, and may your fun, funky spirit grow even bigger and brighter!
I love how you look right into my eyes and ask how I am, and you truly give the best lemony hugs! You bring much joy and love to my heart!
We love you so much and will always watch over you!
Love
姑姑, Claris and Cayla`;

(async () => {
  const to = process.argv[2] || 'info@ves.sg';
  const { subject, html } = generateGiftVoucherEmail({
    recipientName: 'Vera',
    giverName: '姑姑, Claris & Cayla',
    giftLabel: 'Family Handbuilding Experience',
    giverMessage,
  });

  const res = await sendEmail({ to, subject: '[TEST] ' + subject, html });
  console.log(res.success ? `✅ Sent to ${to} (id: ${res.messageId})` : `❌ Failed: ${res.error}`);
  process.exit(res.success ? 0 : 1);
})();
