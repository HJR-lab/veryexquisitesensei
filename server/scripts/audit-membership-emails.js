// Read-only audit — did membership-confirmed actually fire for new members?
// Cross-checks the memberships table (everyone who has ever been a member)
// against sent_emails(email_type='membership_confirmed').
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

(async () => {
  // 1. All membership rows ever created
  const { data: memberships, error: mErr } = await supabase
    .from('memberships')
    .select('id, customer_id, membership_type, status, start_date, end_date, created_at, customers:customer_id(first_name, last_name, email)')
    .order('created_at', { ascending: true });
  if (mErr) throw new Error('memberships query failed: ' + mErr.message);
  console.log('Total memberships in DB: ' + (memberships || []).length);

  // 2. All sent membership_confirmed emails
  const { data: sent, error: sErr } = await supabase
    .from('sent_emails')
    .select('id, recipient_emails, course_identifier, sent_at, sent_by')
    .eq('email_type', 'membership_confirmed')
    .order('sent_at', { ascending: false });
  // A failed query returns data:null — never let that read as "nothing sent".
  if (sErr) throw new Error('sent_emails query failed: ' + sErr.message);
  console.log('Total membership_confirmed emails ever sent: ' + (sent || []).length);

  // Build set of emails that did receive one
  const sentTo = new Set();
  for (const s of (sent || [])) {
    for (const r of (s.recipient_emails || [])) sentTo.add(String(r).toLowerCase());
  }

  // 3. Per-membership status
  console.log('\nPer-membership send status (chronological):');
  const missing = [];
  for (const m of (memberships || [])) {
    const email = (m.customers?.email || '').toLowerCase();
    const got = email && sentTo.has(email);
    const flag = got ? 'EMAIL_SENT' : 'NO_EMAIL  ';
    console.log('  ' + flag + ' | created ' + m.created_at + ' | ' + (m.customers?.first_name || '') + ' ' + (m.customers?.last_name || '') + ' <' + email + '> | type=' + m.membership_type + ' | status=' + m.status);
    if (!got && email) missing.push(m);
  }

  console.log('\nMemberships WITHOUT a membership_confirmed email: ' + missing.length);
  console.log('Memberships WITH one: ' + ((memberships || []).length - missing.length));

  // 4. Recent sends (last 10) — surface origin
  console.log('\nLast 10 membership_confirmed sends:');
  for (const s of (sent || []).slice(0, 10)) {
    console.log('  ' + s.sent_at + ' | ' + (s.recipient_emails || []).join(',') + ' | ' + s.course_identifier + ' | sent_by=' + s.sent_by);
  }
})().catch(e => { console.error(e); process.exit(1); });
