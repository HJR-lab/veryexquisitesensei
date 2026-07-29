/**
 * Durable, idempotent reply-send for the admin inbox (WR-01).
 *
 * The naive flow (send → mark-handled → mark-resolved) can double-send: if Gmail
 * accepts the send but a later step fails, the endpoint errors while the
 * obligation is still sendable, so a retry sends the same reply again.
 *
 * This flow makes the send idempotent:
 *   1. If already resolved with a recorded sent-id → no-op.
 *   2. If a sent-id is already recorded (a prior attempt sent but did not finish
 *      reconciliation) → reconcile only, never resend.
 *   3. Otherwise atomically claim the row (active → 'sending'); a lost race or a
 *      row that is not sendable yields a conflict, never a second send.
 *   4. Send, then persist the Gmail sent-message id immediately (the durable
 *      "already sent" record).
 *   5. Reconcile: Gmail label cleanup is a separately-retryable follow-up, then
 *      mark resolved.
 *
 * All Supabase/Gmail access is injected so the flow is unit-testable.
 */

const ACTIVE_STATUSES = ['new', 'triaged', 'draft_ready', 'waiting_on_human', 'waiting_on_customer'];

function appendHistory(existing, entry) {
  const history = Array.isArray(existing) ? existing : [];
  return [...history, { at: new Date().toISOString(), ...entry }];
}

/**
 * Finish reconciliation for a message whose reply has already reached Gmail:
 * retry the (independent) label cleanup, then mark the obligation resolved.
 */
async function finalizeSend({ supabase, markMessageHandled }, id, message) {
  const now = new Date().toISOString();

  let labelOk = true;
  try {
    await markMessageHandled(message.gmail_message_id);
  } catch (labelErr) {
    // Label removal is cosmetic (clears UNREAD in Gmail) and independently
    // retryable — a failure here must not undo a sent reply.
    labelOk = false;
    console.error('[inboxSend] Gmail label cleanup failed (retryable):', labelErr.message);
  }

  const labelState = { ...(message.gmail_label_state || {}), handled_in_gmail: labelOk };
  if (labelOk) labelState.handled_at = now;
  else labelState.label_cleanup_pending = true;

  const { data, error } = await supabase
    .from('inbox_messages')
    .update({
      status: 'resolved',
      sent_at: message.sent_at || now,
      resolved_at: now,
      next_action: labelOk
        ? 'Resolved: reply sent by admin.'
        : 'Resolved: reply sent by admin. Gmail label cleanup pending.',
      gmail_label_state: labelState,
      action_history: appendHistory(message.action_history, {
        actor: 'admin',
        action: labelOk ? 'sent_reply_and_marked_gmail_handled' : 'sent_reply_label_cleanup_pending',
      }),
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * @param {{ supabase: any, sendReply: Function, markMessageHandled: Function }} deps
 * @param {string} id inbox_messages id
 * @returns {Promise<{ outcome: 'sent'|'reconciled'|'already_sent'|'conflict', message?: object, status?: string }>}
 */
async function performIdempotentSend({ supabase, sendReply, markMessageHandled }, id) {
  const { data: message, error: fetchError } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;
  if (!message.draft_reply || !message.draft_reply.trim()) {
    throw new Error('Draft reply is empty');
  }

  // (1) Already fully resolved — idempotent no-op.
  if (message.status === 'resolved' && message.gmail_sent_message_id) {
    return { outcome: 'already_sent', message };
  }

  // (2) A prior attempt already reached Gmail but did not finish reconciliation.
  // Never resend — just finish reconciling.
  if (message.gmail_sent_message_id) {
    const reconciled = await finalizeSend({ supabase, markMessageHandled }, id, message);
    return { outcome: 'reconciled', message: reconciled };
  }

  // (3) Atomically claim the row for sending. Only a row that is currently in an
  // active state and has no recorded sent-id can transition to 'sending', so
  // concurrent/duplicate requests cannot both send.
  const claimAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('inbox_messages')
    .update({ status: 'sending', sending_started_at: claimAt, updated_at: claimAt })
    .eq('id', id)
    .in('status', ACTIVE_STATUSES)
    .is('gmail_sent_message_id', null)
    .select()
    .maybeSingle();
  if (claimError) throw claimError;

  if (!claimed) {
    // Lost the race, or the row is 'sending'/'resolved'/'sent'. Re-read to classify.
    const { data: current } = await supabase
      .from('inbox_messages')
      .select('status, gmail_sent_message_id')
      .eq('id', id)
      .single();
    if (current && (current.gmail_sent_message_id || current.status === 'resolved')) {
      return { outcome: 'already_sent', message: current };
    }
    return { outcome: 'conflict', status: current ? current.status : 'unknown' };
  }

  // (4) Send. On Gmail failure, roll the claim back so the admin can retry —
  // but only while no sent-id has been recorded.
  let sent;
  try {
    sent = await sendReply({
      to: message.from_email,
      subject: message.subject,
      body: message.draft_reply,
      threadId: message.gmail_thread_id,
      messageId: message.gmail_message_id_header || message.gmail_message_id,
    });
  } catch (sendErr) {
    const now = new Date().toISOString();
    await supabase
      .from('inbox_messages')
      .update({
        status: message.status,
        sending_started_at: null,
        updated_at: now,
        action_history: appendHistory(message.action_history, {
          actor: 'admin',
          action: 'send_failed',
          error: sendErr.message,
        }),
      })
      .eq('id', id)
      .is('gmail_sent_message_id', null);
    throw sendErr;
  }

  // Persist the durable sent-message id IMMEDIATELY after the send accepts.
  const sentAt = new Date().toISOString();
  const sentId = sent && sent.id ? sent.id : 'sent';
  const { error: recordError } = await supabase
    .from('inbox_messages')
    .update({ gmail_sent_message_id: sentId, sent_at: sentAt, updated_at: sentAt })
    .eq('id', id);
  if (recordError) throw recordError;

  // (5) Reconcile (label cleanup + resolve).
  const finalized = await finalizeSend(
    { supabase, markMessageHandled },
    id,
    { ...message, gmail_sent_message_id: sentId, sent_at: sentAt },
  );
  return { outcome: 'sent', message: finalized };
}

module.exports = { performIdempotentSend, finalizeSend, appendHistory, ACTIVE_STATUSES };
