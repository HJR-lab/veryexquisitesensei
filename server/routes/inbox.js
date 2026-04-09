const { supabase } = require('../utils/supabaseDb');
const { getAuthUrl, handleCallback, isConnected, sendReply } = require('../utils/gmailClient');
const { processNewEmails } = require('../utils/inboxProcessor');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://club.ves.sg';

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

  // GET /api/admin/settings/gmail — check connection status
  app.get('/api/admin/settings/gmail', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const connected = await isConnected();
    res.json({ connected });
  }));

  // GET /api/admin/settings/gmail/connect — get OAuth URL
  app.get('/api/admin/settings/gmail/connect', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const url = await getAuthUrl();
    res.json({ url });
  }));

  // GET /api/admin/settings/gmail/callback — OAuth callback (no auth, redirected from Google)
  app.get('/api/admin/settings/gmail/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    await handleCallback(code);
    res.redirect(`${FRONTEND_URL}/admin/inbox?gmail=connected`);
  }));

  // GET /api/admin/inbox — list inbox messages
  app.get('/api/admin/inbox', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { category, status } = req.query;

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
      .order('received_at', { ascending: false })
      .limit(100);

    if (category) {
      query = query.eq('category', category);
    }

    if (status) {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['new', 'draft_ready']);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: data });
  }));

  // GET /api/admin/inbox/stats — count messages by category
  app.get('/api/admin/inbox/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('category')
      .in('status', ['new', 'draft_ready']);

    if (error) throw error;

    const counts = {};
    let total = 0;
    for (const row of data) {
      const cat = row.category || 'uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
      total++;
    }

    res.json({ total, ...counts });
  }));

  // POST /api/admin/inbox/refresh — fetch and process new emails
  app.post('/api/admin/inbox/refresh', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const processed = await processNewEmails();
    res.json({ processed, message: `Processed ${processed} new email(s)` });
  }));

  // PUT /api/admin/inbox/:id — update draft reply
  app.put('/api/admin/inbox/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { draft_reply } = req.body;

    const { data, error } = await supabase
      .from('inbox_messages')
      .update({ draft_reply, status: 'draft_ready' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: data });
  }));

  // POST /api/admin/inbox/:id/send — send draft reply
  app.post('/api/admin/inbox/:id/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data: message, error: fetchError } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    await sendReply({
      to: message.from_email,
      subject: message.subject,
      body: message.draft_reply,
      threadId: message.gmail_thread_id,
      messageId: message.gmail_message_id,
    });

    const { data, error: updateError } = await supabase
      .from('inbox_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;
    res.json({ message: data });
  }));

  // POST /api/admin/inbox/:id/dismiss — dismiss message
  app.post('/api/admin/inbox/:id/dismiss', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('inbox_messages')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: data });
  }));

  // GET /api/admin/inbox/prompt — get custom prompt instructions
  app.get('/api/admin/inbox/prompt', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'inbox_prompt_instructions')
      .maybeSingle();

    res.json({ instructions: data?.setting_value || '' });
  }));

  // PUT /api/admin/inbox/prompt — update custom prompt instructions
  app.put('/api/admin/inbox/prompt', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { instructions } = req.body;

    const { error } = await supabase
      .from('admin_settings')
      .upsert(
        { setting_key: 'inbox_prompt_instructions', setting_value: instructions || '', updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' }
      );

    if (error) throw error;
    res.json({ success: true });
  }));
};
