#!/usr/bin/env node
/**
 * Re-send a Clay Club membership confirmation to one member.
 *
 * For the case where the original send is logged in sent_emails but the member
 * never saw it. The normal sweep will not re-send: it dedupes on
 * (email_type, course_identifier, recipient) and finds the original row.
 *
 * Addresses the member directly rather than BCC-ing them behind the studio
 * copy, so delivery for this one message is unambiguous and checkable in
 * Resend.
 *
 * Usage: node scripts/resend-membership-email.js <email> [--send]
 * Without --send it prints what it would do and exits.
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { sendEmail } = require('../utils/emailService');
const { readMembershipSettings } = require('../utils/membershipSettings');
const { generateMembershipConfirmedEmail } = require('../email-templates/membership-confirmed');

const email = process.argv[2];
const doSend = process.argv.includes('--send');
if (!email) { console.error('Usage: node scripts/resend-membership-email.js <email> [--send]'); process.exit(1); }

(async () => {
  const { data: customer, error: cErr } = await supabase
    .from('customers').select('id, first_name, last_name, email').ilike('email', email).maybeSingle();
  if (cErr) throw cErr;
  if (!customer) { console.error(`No customer with email ${email}`); process.exit(1); }

  const { data: membership, error: mErr } = await supabase
    .from('memberships').select('*').eq('customer_id', customer.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (mErr) throw mErr;
  if (!membership) { console.error(`No membership for ${email}`); process.exit(1); }

  const months = parseInt(String(membership.membership_type).match(/(\d+)\s*Month/i)?.[1], 10);
  if (!months) { console.error(`Cannot parse months from "${membership.membership_type}"`); process.exit(1); }

  const purchaseDate = membership.purchase_date;
  const courseIdentifier = `MEMBERSHIP_${months}M_${purchaseDate}`;
  const purchasedOnLabel = new Date(purchaseDate + 'T00:00:00Z')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const settings = await readMembershipSettings();
  const { subject, html } = generateMembershipConfirmedEmail({
    firstName: customer.first_name || '',
    months,
    purchaseDate: purchasedOnLabel,
    accessCode: settings.accessCode,
    studioHours: settings.studioHours,
  });

  console.log(`member:     ${customer.first_name} ${customer.last_name} <${customer.email}>`);
  console.log(`membership: ${membership.membership_type} (id ${membership.id}, status ${membership.status})`);
  console.log(`purchased:  ${purchasedOnLabel}`);
  console.log(`identifier: ${courseIdentifier}`);
  console.log(`subject:    ${subject}`);

  const { data: prior } = await supabase
    .from('sent_emails').select('id, sent_at, resend_message_id')
    .eq('email_type', 'membership_confirmed').eq('course_identifier', courseIdentifier)
    .contains('recipient_emails', [customer.email]);
  console.log(`prior sends logged: ${(prior || []).length}`);
  for (const p of prior || []) console.log(`  ${p.sent_at} (resend ${p.resend_message_id})`);

  if (!doSend) { console.log('\nDRY RUN — pass --send to actually send.'); return; }

  const result = await sendEmail({ to: customer.email, subject, html });
  if (!result.success) { console.error('SEND FAILED:', result.error); process.exit(1); }

  await supabase.from('sent_emails').insert({
    email_type: 'membership_confirmed',
    course_identifier: courseIdentifier,
    subject,
    recipient_count: 1,
    recipient_emails: [customer.email],
    sent_by: 'admin-resend',
    resend_message_id: result.messageId,
  });
  console.log(`\nSENT — resend id ${result.messageId}`);
})().catch(e => { console.error(e); process.exit(1); });
