/**
 * Inbox Processor
 *
 * Classifies incoming emails and generates draft replies using OpenAI.
 * Processes unread Gmail messages, matches senders to students, and
 * inserts results into the inbox_messages table.
 */

const { supabase } = require('./supabaseDb');
const { fetchUnreadEmails, isConnected } = require('./gmailClient');

const CATEGORY_LINKS = {
  piece_collection: '/dashboard',
  firing_enquiry: '/dashboard',
  makeup_class: '/classes',
  next_cohort: '/classes',
  membership: '/membership',
  studio_access: '/studio-access',
  general: '/dashboard',
};

const VALID_CATEGORIES = Object.keys(CATEGORY_LINKS);

/**
 * Looks up a customer by email and fetches their relevant studio context.
 * Returns null if no customer is found.
 */
async function getStudentContext(email) {
  // Find customer by email
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, customer_type')
    .eq('email', email)
    .single();

  if (customerError && customerError.code !== 'PGRST116') {
    console.error('[InboxProcessor] Error looking up customer:', customerError.message);
  }

  if (!customer) return null;

  // Fetch active enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('course_type, course_title, course_identifier, status, class_credits_remaining, number_of_weeks')
    .eq('student_id', customer.id)
    .in('status', ['active', 'pending']);

  // Count upcoming bookings (future class instances)
  const now = new Date().toISOString();
  const { count: upcomingBookingsCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', customer.id)
    .eq('status', 'booked')
    .gt('class_date', now);

  // Fetch pottery pieces that are in progress
  const { data: pieces } = await supabase
    .from('pottery_pieces')
    .select('title, status, stage')
    .eq('student_id', customer.id)
    .in('stage', ['in_progress', 'firing', 'ready', 'glazing']);

  // Fetch active membership
  const { data: membership } = await supabase
    .from('memberships')
    .select('status, start_date, end_date')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .single();

  return {
    customer,
    enrollments: enrollments || [],
    upcomingBookingsCount: upcomingBookingsCount || 0,
    pieces: pieces || [],
    activeMembership: membership || null,
  };
}

/**
 * Classifies an email and generates a draft reply using OpenAI gpt-4o.
 * Returns { category, confidence, summary, draftReply }.
 */
async function classifyAndDraft(email, studentContext) {
  const OpenAI = require('openai');
  const openai = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });

  const studentInfo = studentContext
    ? buildStudentInfoBlock(studentContext)
    : 'This sender is not a registered student in the system.';

  const categoryLink = studentContext
    ? null // determined after classification
    : CATEGORY_LINKS.general;

  // Load custom prompt instructions from admin_settings
  let customInstructions = '';
  try {
    const { data: setting } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'inbox_prompt_instructions')
      .maybeSingle();
    if (setting?.setting_value) customInstructions = `\n\nAdditional instructions from the studio owner:\n${setting.setting_value}`;
  } catch (e) { /* ignore */ }

  const systemPrompt = `You are Eve, an assistant at Ves Studio, a pottery studio in Singapore. Your job is to:
1. Classify incoming emails into one of these categories: ${VALID_CATEGORIES.join(', ')}
2. Write a warm, helpful draft reply on behalf of the studio

Category definitions:
- piece_collection: Student asking about collecting finished pottery pieces
- makeup_class: Student asking to reschedule or make up a missed class
- firing_enquiry: Questions about bisque or glaze firing, kiln schedules
- next_cohort: Enquiries about upcoming courses, starting a new cohort
- membership: Questions about studio membership plans or access
- studio_access: Questions about open studio hours or independent studio access
- general: Any other enquiry not fitting the above

Student context:
${studentInfo}

Guidelines for the draft reply:
- Address the student by first name if known, otherwise use a friendly greeting
- Acknowledge their specific question briefly
- Provide relevant information from their student context where applicable
- Direct them to club.ves.sg for self-service actions (the link will be appended based on category)
- Keep the reply concise (3-5 sentences)
- Sign off as: Eve, Ves Studio
- Do NOT include a subject line
- Do NOT include placeholder text like [link] — the system will append the correct link
${customInstructions}

Respond ONLY with valid JSON in this exact format:
{
  "category": "<one of the valid categories>",
  "confidence": <float between 0 and 1>,
  "summary": "<one sentence summary of what the email is about>",
  "draftReply": "<the full draft reply text>"
}`;

  const userPrompt = `From: ${email.from_name || email.from_email}
Subject: ${email.subject || '(no subject)'}
Message:
${email.body_snippet || '(no body)'}`;

  const response = await openai.chat.completions.create({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0].message.content.trim();
  const parsed = JSON.parse(raw);

  // Normalise category
  const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'general';
  const link = `https://club.ves.sg${CATEGORY_LINKS[category]}`;

  // Append self-service link to draft reply if not already present
  let draftReply = parsed.draftReply || '';
  if (draftReply && !draftReply.includes('club.ves.sg')) {
    draftReply = `${draftReply}\n\nYou can also manage this at: ${link}`;
  }

  return {
    category,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    summary: parsed.summary || '',
    draftReply,
  };
}

/**
 * Builds a human-readable student info block for the OpenAI prompt.
 */
function buildStudentInfoBlock(ctx) {
  const { customer, enrollments, upcomingBookingsCount, pieces, activeMembership } = ctx;
  const lines = [];

  lines.push(`Name: ${customer.first_name} ${customer.last_name}`);
  lines.push(`Email: ${customer.email}`);
  lines.push(`Customer type: ${customer.customer_type || 'student'}`);

  if (enrollments.length > 0) {
    lines.push(`Active enrollments (${enrollments.length}):`);
    for (const e of enrollments) {
      const credits = e.class_credits_remaining != null ? `, credits remaining: ${e.class_credits_remaining}` : '';
      lines.push(`  - ${e.course_title || e.course_type} (${e.status}${credits})`);
    }
  } else {
    lines.push('No active enrollments.');
  }

  lines.push(`Upcoming booked classes: ${upcomingBookingsCount}`);

  if (pieces.length > 0) {
    lines.push(`Pottery pieces in studio (${pieces.length}):`);
    for (const p of pieces) {
      lines.push(`  - "${p.title || 'Untitled'}" — stage: ${p.stage}, status: ${p.status}`);
    }
  } else {
    lines.push('No pottery pieces currently in studio.');
  }

  if (activeMembership) {
    lines.push(`Active membership: yes (expires ${activeMembership.end_date || 'ongoing'})`);
  } else {
    lines.push('No active membership.');
  }

  return lines.join('\n');
}

/**
 * Main processing function. Fetches unread emails from Gmail (last 7 days),
 * skips already-processed messages, classifies each one, and inserts into
 * inbox_messages. Returns the count of newly processed emails.
 */
async function processNewEmails() {
  if (!(await isConnected())) {
    console.log('[InboxProcessor] Gmail not connected — skipping inbox processing.');
    return 0;
  }

  let emails;
  try {
    emails = await fetchUnreadEmails(7);
  } catch (err) {
    console.error('[InboxProcessor] Failed to fetch emails:', err.message);
    return 0;
  }

  if (!emails || emails.length === 0) {
    console.log('[InboxProcessor] No unread emails found.');
    return 0;
  }

  let processedCount = 0;

  for (const email of emails) {
    // Normalize field names (gmailClient returns camelCase)
    const msgId = email.gmailMessageId || email.gmail_message_id;
    const threadId = email.gmailThreadId || email.gmail_thread_id || null;
    const fromEmail = email.fromEmail || email.from_email;
    const fromName = email.fromName || email.from_name || null;
    const subject = email.subject || null;
    const bodySnippet = (email.body || email.body_snippet || '').substring(0, 500);
    const receivedAt = email.receivedAt || email.received_at || new Date().toISOString();

    try {
      // Skip if already in inbox_messages
      const { data: existing } = await supabase
        .from('inbox_messages')
        .select('id')
        .eq('gmail_message_id', msgId)
        .single();

      if (existing) continue;

      // Match sender to student
      const studentContext = await getStudentContext(fromEmail);

      // Classify and generate draft reply (add delay to respect rate limits)
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { category, confidence, summary, draftReply } = await classifyAndDraft(
        { from_name: fromName, from_email: fromEmail, subject, body_snippet: bodySnippet },
        studentContext
      );

      // Determine status
      const status = draftReply ? 'draft_ready' : 'new';

      // Insert into inbox_messages
      const { error: insertError } = await supabase
        .from('inbox_messages')
        .insert([{
          gmail_message_id: msgId,
          gmail_thread_id: threadId,
          from_email: fromEmail,
          from_name: fromName,
          subject,
          body_snippet: bodySnippet,
          received_at: receivedAt,
          category,
          confidence,
          summary,
          draft_reply: draftReply || null,
          student_id: studentContext ? studentContext.customer.id : null,
          status,
          created_at: new Date().toISOString(),
        }]);

      if (insertError) {
        console.error(`[InboxProcessor] Failed to insert message ${msgId}:`, insertError.message);
        continue;
      }

      processedCount++;
      console.log(`[InboxProcessor] Processed: "${subject}" from ${fromEmail} → category: ${category} (${(confidence * 100).toFixed(0)}%)`);
    } catch (err) {
      console.error(`[InboxProcessor] Error processing email ${msgId}:`, err.message);
    }
  }

  console.log(`[InboxProcessor] Done. Processed ${processedCount} new email(s).`);
  return processedCount;
}

module.exports = {
  getStudentContext,
  classifyAndDraft,
  processNewEmails,
};
