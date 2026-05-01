const { supabase } = require('../utils/supabaseDb');
const { resolveSegment } = require('../utils/segmentResolver');
const { sendCampaignToSegment, sendCampaignEmail } = require('../utils/campaignCron');
const { sendEmail } = require('../utils/emailService');
const { wrapEmailTemplate } = require('../email-templates/base');
const jwt = require('jsonwebtoken');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

  // ─── Campaign CRUD ───────────────────────────────────────────────────

  // GET /api/admin/crm/campaigns — list all campaigns with sent/open counts
  app.get('/api/admin/crm/campaigns', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach sent_count and open_count for each campaign
    const enriched = await Promise.all(campaigns.map(async (campaign) => {
      const { count: sent_count } = await supabase
        .from('campaign_sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id);

      const { data: sends } = await supabase
        .from('campaign_sends')
        .select('id')
        .eq('campaign_id', campaign.id);

      let open_count = 0;
      if (sends && sends.length > 0) {
        const sendIds = sends.map(s => s.id);
        const { count } = await supabase
          .from('campaign_events')
          .select('*', { count: 'exact', head: true })
          .in('campaign_send_id', sendIds)
          .eq('event_type', 'opened');
        open_count = count || 0;
      }

      return { ...campaign, sent_count: sent_count || 0, open_count };
    }));

    res.json(enriched);
  }));

  // POST /api/admin/crm/campaigns — create campaign
  app.post('/api/admin/crm/campaigns', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { name, type, subject, html_body, segment, trigger_type, trigger_days, scheduled_at } = req.body;

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        type: type || 'manual',
        subject,
        html_body,
        segment,
        trigger_type,
        trigger_days,
        scheduled_at,
        status: 'draft',
        created_by: req.user.dbCustomerId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  }));

  // PATCH /api/admin/crm/campaigns/:id — update campaign
  app.patch('/api/admin/crm/campaigns/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const updates = { ...req.body };
    // Don't allow changing protected fields
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // DELETE /api/admin/crm/campaigns/:id — only delete drafts
  app.delete('/api/admin/crm/campaigns/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    // Check status first
    const { data: campaign, error: fetchErr } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;
    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft campaigns' });
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  }));

  // POST /api/admin/crm/campaigns/:id/send — send campaign immediately
  app.post('/api/admin/crm/campaigns/:id/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: campaign, error: fetchErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    if (!campaign.subject || !campaign.html_body) {
      return res.status(400).json({ error: 'Campaign must have subject and html_body before sending' });
    }

    const count = await sendCampaignToSegment(campaign);

    await supabase
      .from('campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, sent_count: count });
  }));

  // GET /api/admin/crm/campaigns/:id/stats — campaign statistics
  app.get('/api/admin/crm/campaigns/:id/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const campaignId = req.params.id;

    const { data: sends } = await supabase
      .from('campaign_sends')
      .select('id')
      .eq('campaign_id', campaignId);

    const total_sent = sends ? sends.length : 0;

    if (total_sent === 0) {
      return res.json({ total_sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, open_rate: 0 });
    }

    const sendIds = sends.map(s => s.id);

    const { data: events } = await supabase
      .from('campaign_events')
      .select('event_type')
      .in('campaign_send_id', sendIds);

    const counts = { delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    if (events) {
      for (const e of events) {
        if (counts[e.event_type] !== undefined) {
          counts[e.event_type]++;
        }
      }
    }

    res.json({
      total_sent,
      ...counts,
      open_rate: total_sent > 0 ? Math.round((counts.opened / total_sent) * 100) / 100 : 0
    });
  }));

  // ─── Segments ────────────────────────────────────────────────────────

  // GET /api/admin/crm/segments/:key/preview — preview a segment
  app.get('/api/admin/crm/segments/:key/preview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const customers = await resolveSegment(req.params.key);
    const sample = (customers || []).slice(0, 10).map(c => ({ id: c.id, name: c.first_name, email: c.email }));
    res.json({ count: customers ? customers.length : 0, sample });
  }));

  // ─── Automations ─────────────────────────────────────────────────────

  // GET /api/admin/crm/automations — list automated campaigns
  app.get('/api/admin/crm/automations', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: automations, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('type', 'automated')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched = await Promise.all(automations.map(async (auto) => {
      const { count: total_sends } = await supabase
        .from('campaign_sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', auto.id);

      const { data: lastSend } = await supabase
        .from('campaign_sends')
        .select('sent_at')
        .eq('campaign_id', auto.id)
        .order('sent_at', { ascending: false })
        .limit(1);

      return {
        ...auto,
        total_sends: total_sends || 0,
        last_sent_at: lastSend && lastSend.length > 0 ? lastSend[0].sent_at : null
      };
    }));

    res.json(enriched);
  }));

  // PATCH /api/admin/crm/automations/:id — update automated campaign
  app.patch('/api/admin/crm/automations/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    // Verify it's an automated campaign
    const { data: existing, error: fetchErr } = await supabase
      .from('campaigns')
      .select('type')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;
    if (existing.type !== 'automated') {
      return res.status(400).json({ error: 'Can only update automated campaigns via this endpoint' });
    }

    const { status, trigger_days, subject, html_body, segment } = req.body;
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (trigger_days !== undefined) updates.trigger_days = trigger_days;
    if (subject !== undefined) updates.subject = subject;
    if (html_body !== undefined) updates.html_body = html_body;
    if (segment !== undefined) updates.segment = segment;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // ─── Events ──────────────────────────────────────────────────────────

  // GET /api/admin/crm/events — list events with RSVP counts
  app.get('/api/admin/crm/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (error) throw error;

    const enriched = await Promise.all(events.map(async (event) => {
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('status')
        .eq('event_id', event.id);

      const counts = { attending: 0, declined: 0, invited: 0 };
      if (rsvps) {
        for (const r of rsvps) {
          if (counts[r.status] !== undefined) counts[r.status]++;
        }
      }

      return { ...event, rsvp_counts: counts };
    }));

    res.json(enriched);
  }));

  // POST /api/admin/crm/events — create event
  app.post('/api/admin/crm/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { title, description, event_date, location, max_capacity, rsvp_deadline, target_segment } = req.body;

    const { data, error } = await supabase
      .from('events')
      .insert({ title, description, event_date, location, max_capacity, rsvp_deadline, target_segment })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  }));

  // PATCH /api/admin/crm/events/:id — update event
  app.patch('/api/admin/crm/events/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const updates = { ...req.body };
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // POST /api/admin/crm/events/:id/invite — send invites to segment
  app.post('/api/admin/crm/events/:id/invite', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const eventId = req.params.id;

    const { data: event, error: fetchErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchErr) throw fetchErr;

    if (!event.target_segment) {
      return res.status(400).json({ error: 'Event must have a target_segment' });
    }

    // Resolve segment
    const customers = await resolveSegment(event.target_segment);

    // Filter out already-invited customers
    const { data: existingRsvps } = await supabase
      .from('event_rsvps')
      .select('customer_id')
      .eq('event_id', eventId);

    const alreadyInvited = new Set((existingRsvps || []).map(r => r.customer_id));
    const toInvite = (customers || []).filter(c => !alreadyInvited.has(c.id));

    // Format event date
    const eventDateFormatted = event.event_date
      ? new Date(event.event_date).toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'TBA';

    // Send invites with rate limiting (10 per second)
    let sentCount = 0;
    for (let i = 0; i < toInvite.length; i++) {
      const customer = toInvite[i];

      const rsvpToken = jwt.sign(
        { customerId: customer.id, eventId: parseInt(eventId) },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      const rsvpUrl = `https://club.ves.sg/events/${eventId}/rsvp?token=${rsvpToken}`;

      const body = `
  <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">You're Invited!</h1>
  <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
    Hi ${customer.first_name || 'there'}, we'd love for you to join us for a special event at VES!
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
    <tr><td style="padding: 16px 20px;">
      <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase;">Event Details</p>
      <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${event.title}</p>
      <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${eventDateFormatted}</p>
      <p style="margin: 0; font-size: 15px; color: #282828;">${event.location || 'VES Pottery Studio'}</p>
    </td></tr>
  </table>
  ${event.description ? `<p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">${event.description}</p>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
    <tr><td align="center">
      <a href="${rsvpUrl}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">RSVP Now</a>
    </td></tr>
  </table>`;

      try {
        await sendEmail({
          to: customer.email,
          subject: `You're Invited: ${event.title}`,
          html: wrapEmailTemplate(body)
        });

        await supabase
          .from('event_rsvps')
          .insert({ event_id: parseInt(eventId), customer_id: customer.id, status: 'invited' });

        sentCount++;
      } catch (err) {
        console.error(`[CRM] Failed to send invite to ${customer.email}:`, err.message);
      }

      // Rate limit: pause every 10 sends for 1 second
      if ((i + 1) % 10 === 0 && i + 1 < toInvite.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Update event status
    await supabase
      .from('events')
      .update({ status: 'published' })
      .eq('id', eventId);

    res.json({ success: true, invited: sentCount, already_invited: alreadyInvited.size });
  }));

  // GET /api/admin/crm/events/:id/rsvps — list RSVPs with customer details
  app.get('/api/admin/crm/events/:id/rsvps', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('*, customers(id, first_name, last_name, email)')
      .eq('event_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  }));

  // ─── Public RSVP (no auth) ──────────────────────────────────────────

  // GET /api/events/:eventId — public event details
  app.get('/api/events/:eventId', asyncHandler(async (req, res) => {
    const { data: event, error } = await supabase
      .from('events')
      .select('id, title, description, event_date, location, max_capacity, rsvp_deadline')
      .eq('id', req.params.eventId)
      .single();

    if (error) throw error;

    const { count: attending_count } = await supabase
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', req.params.eventId)
      .eq('status', 'attending');

    res.json({ ...event, attending_count: attending_count || 0 });
  }));

  // POST /api/events/:eventId/rsvp — public RSVP submission
  app.post('/api/events/:eventId/rsvp', asyncHandler(async (req, res) => {
    const { token, response } = req.body;
    const eventId = parseInt(req.params.eventId);

    if (!token || !response) {
      return res.status(400).json({ error: 'token and response are required' });
    }

    if (!['attending', 'declined'].includes(response)) {
      return res.status(400).json({ error: 'response must be attending or declined' });
    }

    // Verify JWT
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (payload.eventId !== eventId) {
      return res.status(400).json({ error: 'Token does not match this event' });
    }

    // If attending, check capacity
    if (response === 'attending') {
      const { data: event } = await supabase
        .from('events')
        .select('max_capacity')
        .eq('id', eventId)
        .single();

      if (event && event.max_capacity) {
        const { count: currentAttending } = await supabase
          .from('event_rsvps')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('status', 'attending');

        if ((currentAttending || 0) >= event.max_capacity) {
          return res.status(400).json({ error: 'Event is at full capacity' });
        }
      }
    }

    // Update RSVP
    const { data, error } = await supabase
      .from('event_rsvps')
      .update({ status: response, responded_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('customer_id', payload.customerId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // ─── Resend Webhook (no auth) ───────────────────────────────────────

  // POST /api/webhooks/resend — email event tracking
  app.post('/api/webhooks/resend', asyncHandler(async (req, res) => {
    const { type, data } = req.body;

    const typeMap = {
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced'
    };

    const event_type = typeMap[type];
    if (!event_type) {
      return res.json({ ok: true, skipped: true });
    }

    // Find the campaign_send by resend_message_id
    const { data: send } = await supabase
      .from('campaign_sends')
      .select('id')
      .eq('resend_message_id', data.email_id)
      .single();

    if (!send) {
      return res.json({ ok: true, no_match: true });
    }

    const { error } = await supabase
      .from('campaign_events')
      .insert({
        campaign_send_id: send.id,
        event_type,
        event_data: data
      });

    if (error) {
      console.error('[Resend Webhook] Failed to insert event:', error);
    }

    res.json({ ok: true });
  }));

};
