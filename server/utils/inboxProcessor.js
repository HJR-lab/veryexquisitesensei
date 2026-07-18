/*
 * VES Inbox Processor / Obligation v1
 *
 * Gmail is an input channel. The durable object is a VES customer obligation:
 * a reply/decision/resolution the studio owns. AI may classify, summarize, and
 * draft. It must never send externally; send remains an explicit admin action.
 */

const { supabase } = require('./supabaseDb');
const { fetchUnreadEmails, isConnected } = require('./gmailClient');

const CATEGORY_LINKS = {
  urgent_customer_reply: '/admin/inbox',
  makeup_or_reschedule: '/classes',
  piece_collection: '/dashboard',
  firing_or_piece_status: '/dashboard',
  course_or_next_cohort: '/classes',
  membership_or_studio_access: '/membership',
  payment_or_refund_sensitive: '/admin/inbox',
  retention_risk: '/admin/students',
  general: '/dashboard',
};

const VALID_CATEGORIES = Object.keys(CATEGORY_LINKS);
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const VALID_RISK_FLAGS = [
  'low_confidence',
  'no_matching_student',
  'policy_sensitive',
  'refund_or_payment',
  'angry_or_disappointed',
  'scheduling_conflict',
  'inventory_or_piece_uncertain',
  'needs_human_review',
];

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

function normalizeRiskFlags(flags) {
  return [...new Set(asArray(flags).filter(flag => VALID_RISK_FLAGS.includes(flag)))];
}

function inferFallbackTriage(email, studentContext) {
  const text = `${email.subject || ''}\n${email.body || email.body_snippet || ''}`.toLowerCase();
  const flags = [];
  let category = 'general';
  let priority = 'normal';

  if (/refund|payment|charge|invoice|paid|money/.test(text)) {
    category = 'payment_or_refund_sensitive';
    priority = 'high';
    flags.push('refund_or_payment', 'policy_sensitive', 'needs_human_review');
  } else if (/angry|upset|disappointed|complain|unhappy|frustrat/.test(text)) {
    category = 'urgent_customer_reply';
    priority = 'urgent';
    flags.push('angry_or_disappointed', 'needs_human_review');
  } else if (/make.?up|resched|missed class|cannot attend|can't attend/.test(text)) {
    category = 'makeup_or_reschedule';
    priority = 'high';
    flags.push('scheduling_conflict');
  } else if (/collect|pickup|pick up|piece|ready/.test(text)) {
    category = 'piece_collection';
    flags.push('inventory_or_piece_uncertain');
  } else if (/fire|firing|kiln|glaze|bisque/.test(text)) {
    category = 'firing_or_piece_status';
    flags.push('inventory_or_piece_uncertain');
  } else if (/course|cohort|class|start|enrol|enroll/.test(text)) {
    category = 'course_or_next_cohort';
  } else if (/member|membership|studio access|open studio/.test(text)) {
    category = 'membership_or_studio_access';
  }

  if (!studentContext) flags.push('no_matching_student');

  return {
    category,
    priority,
    riskFlags: normalizeRiskFlags(flags),
    needsHumanReview: flags.includes('needs_human_review') || !studentContext,
  };
}

async function getStudentContext(email, client = supabase) {
  const { data: customer, error: customerError } = await client
    .from('customers')
    .select('id, first_name, last_name, email, customer_type, classes_used, membership_tier, historical_completed')
    .eq('email', email)
    .maybeSingle();

  if (customerError && customerError.code !== 'PGRST116') {
    console.error('[InboxProcessor] Error looking up customer:', customerError.message);
  }

  if (!customer) return null;

  // Every sub-query error is surfaced rather than silently degraded — inaccurate
  // context (e.g. "0 upcoming bookings" from a failed query) would mislead the
  // drafting model into a wrong customer reply.
  const { data: enrollments, error: enrollmentsError } = await client
    .from('course_enrollments')
    .select('course_type, course_title, course_identifier, status, class_credits_remaining, number_of_weeks, course_start_date, course_end_date')
    .eq('student_id', customer.id)
    .in('status', ['active', 'pending', 'paused']);
  if (enrollmentsError) throw enrollmentsError;

  // Upcoming bookings: the class date lives on the related class_instances row,
  // not on bookings. Join through the FK and count rows dated today or later.
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: bookingRows, error: bookingsError } = await client
    .from('bookings')
    .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('student_id', customer.id)
    .eq('status', 'booked');
  if (bookingsError) throw bookingsError;
  const upcomingBookingsCount = (bookingRows || []).filter((b) => {
    const cd = b.class_instances && b.class_instances.class_date;
    const dateStr = cd ? String(cd).split(/[T ]/)[0] : '';
    return dateStr && dateStr >= todayStr;
  }).length;

  // Active firing-pipeline batches (not yet collected) live in piece_batches,
  // keyed by customer_id. (pottery_pieces is the finished public gallery and has
  // no status/stage columns — querying it here silently returned nothing before.)
  const { data: pieces, error: piecesError } = await client
    .from('piece_batches')
    .select('status, piece_count, ready_at, collection_date')
    .eq('customer_id', customer.id)
    .neq('status', 'collected');
  if (piecesError) throw piecesError;

  const { data: membership, error: membershipError } = await client
    .from('memberships')
    .select('status, start_date, end_date')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError && membershipError.code !== 'PGRST116') throw membershipError;

  return {
    customer,
    enrollments: enrollments || [],
    upcomingBookingsCount,
    pieces: pieces || [],
    activeMembership: membership || null,
  };
}

async function classifyAndDraft(email, studentContext) {
  const OpenAI = require('openai');
  const fallback = inferFallbackTriage(email, studentContext);
  const openai = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });

  const studentInfo = studentContext
    ? buildStudentInfoBlock(studentContext)
    : 'No matching VES customer/student record was found for this sender email. Do not pretend we know their class, piece, credits, or membership.';

  let customInstructions = '';
  try {
    const { data: setting } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'inbox_prompt_instructions')
      .maybeSingle();
    if (setting?.setting_value) customInstructions = `\n\nAdditional instructions from the studio owner:\n${setting.setting_value}`;
  } catch (e) { /* ignore */ }

  const systemPrompt = `You are Eve, VES Studio's customer obligation triage assistant. Classify an inbound VES customer/studio email and draft a reply for a human admin to review.

Valid categories: ${VALID_CATEGORIES.join(', ')}
Valid priority values: ${VALID_PRIORITIES.join(', ')}
Valid risk flags: ${VALID_RISK_FLAGS.join(', ')}

Category guide:
- urgent_customer_reply: time-sensitive or emotionally sensitive customer-facing message
- makeup_or_reschedule: makeup class, reschedule, missed class, attendance friction
- piece_collection: collecting finished pottery pieces
- firing_or_piece_status: bisque/glaze firing, kiln, piece status
- course_or_next_cohort: course dates, class availability, enrolment, next cohort
- membership_or_studio_access: Clay Club, membership, studio access/open studio
- payment_or_refund_sensitive: payments, refunds, fees, invoices, credits with financial sensitivity
- retention_risk: student is drifting, upset, confused, or may churn
- general: anything else

Student/customer context available to use:
${studentInfo}

Guardrails:
- Never invent policies, refund decisions, pickup dates, firing dates, availability, or exceptions.
- If uncertain, draft a clarifying question and set needsHumanReview true.
- Mention student context only when it is explicitly present above.
- Payment/refund, angry/disappointed tone, unclear piece status, or low confidence must set needsHumanReview true.
- Keep the draft warm and concise. No subject line. Sign off as: Eve, Ves Studio.
- Sending is forbidden for AI; this draft is only for admin review.${customInstructions}

Respond ONLY with valid JSON:
{
  "category": "<valid category>",
  "priority": "low|normal|high|urgent",
  "confidence": <float 0-1>,
  "summary": "<one sentence>",
  "draftReply": "<full draft reply>",
  "riskFlags": ["<valid risk flag>"],
  "needsHumanReview": <boolean>,
  "nextAction": "<atomic next action for staff>"
}`;

  const userPrompt = `From: ${email.from_name || email.from_email}\nSubject: ${email.subject || '(no subject)'}\nMessage:\n${email.body || email.body_snippet || '(no body)'}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content.trim());
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : fallback.category;
    const priority = VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : fallback.priority;
    let riskFlags = normalizeRiskFlags([...(parsed.riskFlags || []), ...fallback.riskFlags]);
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    if (confidence < 0.72) riskFlags.push('low_confidence');
    riskFlags = normalizeRiskFlags(riskFlags);

    const link = `https://club.ves.sg${CATEGORY_LINKS[category]}`;
    let draftReply = parsed.draftReply || '';
    if (draftReply && !draftReply.includes('club.ves.sg') && !['payment_or_refund_sensitive', 'urgent_customer_reply'].includes(category)) {
      draftReply = `${draftReply}\n\nYou can also manage this at: ${link}`;
    }

    return {
      category,
      priority,
      confidence,
      summary: parsed.summary || '',
      draftReply,
      riskFlags,
      needsHumanReview: Boolean(parsed.needsHumanReview) || riskFlags.includes('needs_human_review') || riskFlags.includes('low_confidence'),
      nextAction: parsed.nextAction || defaultNextAction(category, riskFlags),
    };
  } catch (err) {
    console.error('[InboxProcessor] AI classification failed; using fallback triage:', err.message);
    const riskFlags = normalizeRiskFlags([...fallback.riskFlags, 'low_confidence', 'needs_human_review']);
    return {
      category: fallback.category,
      priority: fallback.priority,
      confidence: 0.35,
      summary: `${email.from_email} needs a manual reply about: ${email.subject || 'their message'}`,
      draftReply: buildFallbackDraft(email, studentContext),
      riskFlags,
      needsHumanReview: true,
      nextAction: defaultNextAction(fallback.category, riskFlags),
    };
  }
}

function defaultNextAction(category, riskFlags) {
  if (riskFlags.includes('refund_or_payment')) return 'Review payment/refund context, edit draft, then send manually if accurate.';
  if (riskFlags.includes('inventory_or_piece_uncertain')) return 'Verify piece/firing status before sending the draft.';
  if (riskFlags.includes('scheduling_conflict')) return 'Check class availability/reschedule policy before sending.';
  if (category === 'urgent_customer_reply') return 'Review immediately and send a human-approved reply.';
  return 'Review the suggested reply, edit if needed, then click Send Reply.';
}

function buildFallbackDraft(email, studentContext) {
  const name = studentContext?.customer?.first_name;
  return `Hi${name ? ` ${name}` : ''},\n\nThanks for writing in. I want to make sure we give you the correct answer, so the studio team will check this and get back to you shortly.\n\nEve, Ves Studio`;
}

function buildStudentInfoBlock(ctx) {
  const { customer, enrollments, upcomingBookingsCount, pieces, activeMembership } = ctx;
  const lines = [];
  lines.push(`Name: ${customer.first_name || ''} ${customer.last_name || ''}`.trim());
  lines.push(`Email: ${customer.email}`);
  lines.push(`Customer type: ${customer.customer_type || 'student'}`);
  if (customer.classes_used != null) lines.push(`Classes used: ${customer.classes_used}`);
  if (customer.historical_completed != null) lines.push(`Historical completed courses: ${customer.historical_completed}`);
  if (customer.membership_tier) lines.push(`Membership tier: ${customer.membership_tier}`);

  if (enrollments.length > 0) {
    lines.push(`Active/pending/paused enrollments (${enrollments.length}):`);
    for (const e of enrollments) {
      const credits = e.class_credits_remaining != null ? `, credits remaining: ${e.class_credits_remaining}` : '';
      const dates = [e.course_start_date, e.course_end_date].filter(Boolean).join(' to ');
      lines.push(`  - ${e.course_title || e.course_type} (${e.status}${credits}${dates ? `, ${dates}` : ''})`);
    }
  } else {
    lines.push('No active/pending/paused enrollments found.');
  }

  lines.push(`Upcoming booked classes: ${upcomingBookingsCount}`);

  if (pieces.length > 0) {
    lines.push(`Piece batches in studio (${pieces.length}):`);
    for (const p of pieces) {
      const count = p.piece_count != null ? `${p.piece_count} piece(s)` : 'piece batch';
      const ready = p.ready_at ? `, ready ${String(p.ready_at).split(/[T ]/)[0]}` : '';
      lines.push(`  - ${count} — status: ${p.status}${ready}`);
    }
  } else {
    lines.push('No active piece batches in studio records.');
  }

  lines.push(activeMembership ? `Active membership: yes (expires ${activeMembership.end_date || 'ongoing'})` : 'No active membership found.');
  return lines.join('\n');
}

function compactStudentContext(ctx) {
  if (!ctx) return null;
  return {
    customer: ctx.customer,
    enrollments: ctx.enrollments,
    upcomingBookingsCount: ctx.upcomingBookingsCount,
    pieces: ctx.pieces,
    activeMembership: ctx.activeMembership,
  };
}

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
    const msgId = email.gmailMessageId || email.gmail_message_id;
    const threadId = email.gmailThreadId || email.gmail_thread_id || null;
    const fromEmail = email.fromEmail || email.from_email;
    const fromName = email.fromName || email.from_name || null;
    const subject = email.subject || null;
    const bodyFull = (email.body || email.body_full || '').substring(0, 12000);
    const bodySnippet = (email.snippet || bodyFull || '').substring(0, 500);
    const receivedAt = email.receivedAt || email.received_at || new Date().toISOString();

    try {
      const { data: existing } = await supabase
        .from('inbox_messages')
        .select('id')
        .eq('gmail_message_id', msgId)
        .maybeSingle();
      if (existing) continue;

      const studentContext = await getStudentContext(fromEmail);
      await new Promise(resolve => setTimeout(resolve, 1200));
      const triage = await classifyAndDraft(
        { from_name: fromName, from_email: fromEmail, subject, body: bodyFull, body_snippet: bodySnippet },
        studentContext
      );

      const status = triage.draftReply ? 'draft_ready' : 'triaged';
      const now = new Date().toISOString();
      const actionHistory = [{ at: now, actor: 'ai', action: 'triaged_from_gmail', confidence: triage.confidence }];

      const { error: insertError } = await supabase
        .from('inbox_messages')
        .insert([{
          gmail_message_id: msgId,
          gmail_thread_id: threadId,
          gmail_message_id_header: email.messageIdHeader || null,
          from_email: fromEmail,
          from_name: fromName,
          subject,
          body_snippet: bodySnippet,
          body_full: bodyFull,
          source_type: 'gmail',
          source_url: threadId ? `https://mail.google.com/mail/u/0/#inbox/${threadId}` : null,
          received_at: receivedAt,
          category: triage.category,
          priority: triage.priority,
          confidence: triage.confidence,
          summary: triage.summary,
          draft_reply: triage.draftReply || null,
          student_id: studentContext ? studentContext.customer.id : null,
          customer_context: compactStudentContext(studentContext),
          risk_flags: triage.riskFlags,
          needs_human_review: triage.needsHumanReview,
          owner: 'studio',
          next_action: triage.nextAction,
          status,
          action_history: actionHistory,
          gmail_label_state: { unread_at_ingest: true, handled_in_gmail: false },
          created_at: now,
          updated_at: now,
        }]);

      if (insertError) {
        console.error(`[InboxProcessor] Failed to insert message ${msgId}:`, insertError.message);
        continue;
      }

      processedCount++;
      console.log(`[InboxProcessor] Obligation: "${subject}" from ${fromEmail} → ${triage.category}/${triage.priority} (${(triage.confidence * 100).toFixed(0)}%)`);
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
  VALID_CATEGORIES,
  VALID_RISK_FLAGS,
};
