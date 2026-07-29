const { supabase } = require('../utils/supabaseDb');
const { getAuthUrl, getGmailEnvStatus, handleCallback, isConnected, markMessageHandled, sendReply } = require('../utils/gmailClient');
const { processNewEmails, VALID_CATEGORIES } = require('../utils/inboxProcessor');
const { performIdempotentSend, appendHistory, ACTIVE_STATUSES } = require('../utils/inboxSend');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://club.ves.sg';

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {
  app.get('/api/admin/settings/gmail', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const env = getGmailEnvStatus();
    const connected = await isConnected();
    res.json({ connected, env });
  }));

  app.get('/api/admin/settings/gmail/connect', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const url = await getAuthUrl();
    res.json({ url });
  }));

  app.get('/api/admin/settings/gmail/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    await handleCallback(code);
    res.redirect(`${FRONTEND_URL}/admin/inbox?gmail=connected`);
  }));

  app.get('/api/admin/inbox', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { category, status, priority } = req.query;

    let query = supabase
      .from('inbox_messages')
      .select(`
        *,
        customers (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .order('priority_rank', { ascending: true })
      .order('received_at', { ascending: false })
      .limit(100);

    if (category && category !== 'all') query = query.eq('category', category);
    if (priority && priority !== 'all') query = query.eq('priority', priority);
    if (status && status !== 'all') query = query.eq('status', status);
    else query = query.in('status', ACTIVE_STATUSES);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ messages: data });
  }));

  app.get('/api/admin/inbox/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('category, priority, status, needs_human_review')
      .in('status', ACTIVE_STATUSES);

    if (error) throw error;

    const stats = { total: 0, categories: {}, priorities: {}, statuses: {}, needs_human_review: 0 };
    for (const row of data || []) {
      stats.total += 1;
      stats.categories[row.category || 'general'] = (stats.categories[row.category || 'general'] || 0) + 1;
      stats.priorities[row.priority || 'normal'] = (stats.priorities[row.priority || 'normal'] || 0) + 1;
      stats.statuses[row.status || 'new'] = (stats.statuses[row.status || 'new'] || 0) + 1;
      if (row.needs_human_review) stats.needs_human_review += 1;
    }

    res.json(stats);
  }));

  app.post('/api/admin/inbox/refresh', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const processed = await processNewEmails();
    res.json({ processed, message: `Processed ${processed} new customer obligation(s)` });
  }));

  app.put('/api/admin/inbox/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { draft_reply, next_action, status } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('inbox_messages')
      .select('action_history')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const update = {
      updated_at: new Date().toISOString(),
      action_history: appendHistory(existing.action_history, { actor: 'admin', action: 'updated_draft_or_next_action' }),
    };
    if (draft_reply !== undefined) update.draft_reply = draft_reply;
    if (next_action !== undefined) update.next_action = next_action;
    if (status !== undefined) update.status = status;
    else if (draft_reply) update.status = 'draft_ready';

    const { data, error } = await supabase
      .from('inbox_messages')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: data });
  }));

  app.post('/api/admin/inbox/:id/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Durable idempotent send: claims the row before sending, records the Gmail
    // sent-message id immediately after, and reconciles label cleanup separately,
    // so a retry after a partial failure never sends the same reply twice.
    const result = await performIdempotentSend({ supabase, sendReply, markMessageHandled }, id);

    if (result.outcome === 'conflict') {
      return res.status(409).json({
        error: 'A reply send is already in progress for this message. If it appears stuck, verify in Gmail before retrying.',
        status: result.status,
      });
    }
    res.json({
      message: result.message,
      alreadySent: result.outcome === 'already_sent',
      reconciled: result.outcome === 'reconciled',
    });
  }));

  app.post('/api/admin/inbox/:id/dismiss', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: message, error: fetchError } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    await markMessageHandled(message.gmail_message_id);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('inbox_messages')
      .update({
        status: 'dismissed',
        resolved_at: now,
        next_action: 'Dismissed by admin.',
        gmail_label_state: { ...(message.gmail_label_state || {}), handled_in_gmail: true, handled_at: now },
        action_history: appendHistory(message.action_history, { actor: 'admin', action: 'dismissed_and_marked_gmail_handled' }),
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: data });
  }));

  app.get('/api/admin/inbox/prompt', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'inbox_prompt_instructions')
      .maybeSingle();

    res.json({ instructions: data?.setting_value || '' });
  }));

  app.put('/api/admin/inbox/prompt', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { instructions } = req.body;
    const { error } = await supabase
      .from('admin_settings')
      .upsert(
        { setting_key: 'inbox_prompt_instructions', setting_value: instructions || '', updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' }
      );

    if (error) throw error;
    res.json({ success: true, valid_categories: VALID_CATEGORIES });
  }));
};
