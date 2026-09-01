const supabaseDb = require('../utils/supabaseDb');

// Escape user-supplied values before interpolating into email HTML
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Public (tokenized) endpoints for the second-student details form.
// A multi-pax order creates a "+dup" placeholder customer; the purchaser gets
// a form link to fill in the real student's name/email/mobile. The token is
// the only credential — no login required.
module.exports = function(app, { asyncHandler }) {

async function getRequestByToken(token) {
  const { data, error } = await supabaseDb.supabase
    .from('student_detail_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Form bootstrap: what the public page shows before submission. One link
// covers the whole order — siblings (same order + purchaser) are returned so
// a qty-4 order shows 3 student sections on a single form.
app.get('/api/student-details/:token', asyncHandler(async (req, res) => {
  const request = await getRequestByToken(req.params.token);
  if (!request) return res.status(404).json({ error: 'This link is not valid.' });

  let requests = [request];
  if (request.shopify_order_id) {
    const { data: siblings } = await supabaseDb.supabase
      .from('student_detail_requests')
      .select('*')
      .eq('shopify_order_id', request.shopify_order_id)
      .eq('purchaser_email', request.purchaser_email)
      .order('id', { ascending: true });
    if (siblings && siblings.length > 0) requests = siblings;
  }

  const students = requests.map(r => ({
    token: r.token,
    status: r.status,
    submittedName: r.status !== 'pending'
      ? `${r.submitted_first_name || ''} ${r.submitted_last_name || ''}`.trim()
      : null,
  }));

  res.json({
    status: request.status,
    courseTitle: request.course_title,
    submittedName: students.find(s => s.token === request.token)?.submittedName || null,
    students,
  });
}));

app.post('/api/student-details/:token', asyncHandler(async (req, res) => {
  const request = await getRequestByToken(req.params.token);
  if (!request) return res.status(404).json({ error: 'This link is not valid.' });
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Details for this spot have already been submitted.' });
  }

  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();

  if (!firstName || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (email === String(request.purchaser_email).toLowerCase()) {
    return res.status(400).json({ error: 'Please enter the second student’s own email address — this one belongs to the purchaser.' });
  }

  const submission = {
    submitted_first_name: firstName,
    submitted_last_name: lastName,
    submitted_email: email,
    submitted_phone: phone || null,
    completed_at: new Date().toISOString(),
  };

  // If the email already belongs to an existing account we can't just rename
  // the placeholder — the enrollments would need a manual merge. Park it for
  // admin instead of failing the user.
  const existingCustomer = await supabaseDb.findCustomerByEmail(email);
  if (existingCustomer && existingCustomer.id !== request.placeholder_customer_id) {
    await supabaseDb.supabase
      .from('student_detail_requests')
      .update({ ...submission, status: 'needs_admin' })
      .eq('id', request.id);

    // INBOX_ADDRESS, not FROM_ADDRESS: this alert is for the studio to read,
    // and mail.ves.sg has no mailbox — these notifications bounced silently.
    const { sendEmail, INBOX_ADDRESS } = require('../utils/emailService');
    const safeName = `${esc(firstName)} ${esc(lastName)}`.trim();
    sendEmail({
      to: INBOX_ADDRESS,
      subject: `VES Admin: student details submission needs a merge (${`${firstName} ${lastName}`.replace(/[\r\n]+/g, ' ').trim()})`,
      html: `<p>A second-student details form was submitted with an email that already has an account:</p>
        <p><strong>${safeName}</strong> — ${esc(email)}${phone ? ` — ${esc(phone)}` : ''}</p>
        <p>Placeholder customer id: ${request.placeholder_customer_id} (purchaser: ${esc(request.purchaser_email)}${request.course_title ? `, ${esc(request.course_title)}` : ''})</p>
        <p>The placeholder's enrollment/bookings need to be moved onto the existing account manually.</p>`,
    }).catch(err => console.error('[StudentDetails] admin notify failed:', err.message));

    return res.json({ success: true, note: 'Thanks! This email already has a VES account — we’ll link everything up and confirm shortly.' });
  }

  // Normal path: the placeholder becomes the real student. Lock name+email so
  // Shopify sync never claws the details back to the +dup alias.
  const { error: updateError } = await supabaseDb.supabase
    .from('customers')
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      mobile: phone || null,
      name_locked: true,
      email_locked: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.placeholder_customer_id);
  if (updateError) throw updateError;

  await supabaseDb.supabase
    .from('student_detail_requests')
    .update({ ...submission, status: 'completed' })
    .eq('id', request.id);

  console.log(`[StudentDetails] Placeholder ${request.placeholder_customer_id} completed: ${firstName} ${lastName} <${email}>`);
  res.json({ success: true });
}));

};
