/**
 * Campaign Cron Engine
 * Processes scheduled manual campaigns and automated trigger-based campaigns.
 * Called hourly from cohortAutoProcessor.
 */

const { supabase } = require('./supabaseDb');
const { sendEmail } = require('./emailService');
const { wrapEmailTemplate } = require('../email-templates/base');
const { resolveSegment } = require('./segmentResolver');

/**
 * Main entry point — called hourly by the cron system.
 * 1. Process scheduled manual campaigns (scheduled_at <= now)
 * 2. Process active automated campaigns (trigger-based)
 */
async function processCampaigns() {
  console.log('[Campaign Cron] Processing campaigns...');

  try {
    await processScheduledCampaigns();
    await processAutomatedCampaigns();
    console.log('[Campaign Cron] Done.');
  } catch (error) {
    console.error('[Campaign Cron] Fatal error:', error);
  }
}

/**
 * Find manual campaigns that are scheduled and due, send them, mark as sent.
 */
async function processScheduledCampaigns() {
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('type', 'manual')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString());

  if (error) {
    console.error('[Campaign Cron] Error fetching scheduled campaigns:', error);
    return;
  }

  if (!campaigns || campaigns.length === 0) return;

  for (const campaign of campaigns) {
    if (!campaign.subject || !campaign.html_body) {
      console.warn(`[Campaign Cron] Skipping campaign "${campaign.name}" (id=${campaign.id}) — missing subject or html_body`);
      continue;
    }

    try {
      const count = await sendCampaignToSegment(campaign);
      console.log(`[Campaign Cron] Manual campaign "${campaign.name}" sent to ${count} recipients`);

      // Mark as sent
      await supabase
        .from('campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaign.id);
    } catch (err) {
      console.error(`[Campaign Cron] Error sending manual campaign "${campaign.name}":`, err);
    }
  }
}

/**
 * Find active automated campaigns, resolve triggers, send to new recipients.
 */
async function processAutomatedCampaigns() {
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('type', 'automated')
    .eq('status', 'active');

  if (error) {
    console.error('[Campaign Cron] Error fetching automated campaigns:', error);
    return;
  }

  if (!campaigns || campaigns.length === 0) return;

  for (const campaign of campaigns) {
    if (!campaign.subject || !campaign.html_body) {
      console.warn(`[Campaign Cron] Skipping automated campaign "${campaign.name}" (id=${campaign.id}) — missing subject or html_body`);
      continue;
    }

    try {
      const customers = await resolveTrigger(campaign);
      if (!customers || customers.length === 0) continue;

      // Filter out already-sent
      const { data: alreadySent } = await supabase
        .from('campaign_sends')
        .select('customer_id')
        .eq('campaign_id', campaign.id);

      const sentIds = new Set((alreadySent || []).map(s => s.customer_id));
      const toSend = customers.filter(c => !sentIds.has(c.id));

      if (toSend.length === 0) continue;

      let count = 0;
      for (let i = 0; i < toSend.length; i++) {
        const success = await sendCampaignEmail(campaign, toSend[i]);
        if (success) count++;

        // Rate limit: 1s pause every 10 sends
        if ((i + 1) % 10 === 0 && i + 1 < toSend.length) {
          await sleep(1000);
        }
      }

      console.log(`[Campaign Cron] Automated campaign "${campaign.name}" sent to ${count} new recipients`);
    } catch (err) {
      console.error(`[Campaign Cron] Error processing automated campaign "${campaign.name}":`, err);
    }
  }
}

/**
 * Send a campaign to its entire segment, filtering out already-sent.
 * @param {Object} campaign
 * @returns {number} count of emails sent
 */
async function sendCampaignToSegment(campaign) {
  const customers = await resolveSegment(campaign.segment);
  if (!customers || customers.length === 0) return 0;

  // Filter out already-sent
  const { data: alreadySent } = await supabase
    .from('campaign_sends')
    .select('customer_id')
    .eq('campaign_id', campaign.id);

  const sentIds = new Set((alreadySent || []).map(s => s.customer_id));
  const toSend = customers.filter(c => !sentIds.has(c.id));

  let count = 0;
  for (let i = 0; i < toSend.length; i++) {
    const success = await sendCampaignEmail(campaign, toSend[i]);
    if (success) count++;

    // Rate limit: 1s pause every 10 sends
    if ((i + 1) % 10 === 0 && i + 1 < toSend.length) {
      await sleep(1000);
    }
  }

  return count;
}

/**
 * Send a campaign email to a single customer.
 * Replaces {{first_name}} and {{email}} placeholders.
 * Logs to campaign_sends on success.
 * @param {Object} campaign
 * @param {Object} customer - { id, email, first_name }
 * @returns {boolean} true if sent successfully
 */
async function sendCampaignEmail(campaign, customer) {
  try {
    // Replace placeholders
    let body = campaign.html_body;
    body = body.replace(/\{\{first_name\}\}/g, customer.first_name || '');
    body = body.replace(/\{\{email\}\}/g, customer.email || '');

    const html = wrapEmailTemplate(body);

    let subject = campaign.subject;
    subject = subject.replace(/\{\{first_name\}\}/g, customer.first_name || '');
    subject = subject.replace(/\{\{email\}\}/g, customer.email || '');

    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
    });

    if (result && result.success) {
      // Log to campaign_sends
      await supabase
        .from('campaign_sends')
        .insert({
          campaign_id: campaign.id,
          customer_id: customer.id,
          sent_at: new Date().toISOString(),
          resend_message_id: result.messageId || null,
        });

      return true;
    }

    return false;
  } catch (err) {
    console.error(`[Campaign Cron] Failed to send campaign ${campaign.id} to ${customer.email}:`, err.message);
    return false;
  }
}

/**
 * Resolve which customers should receive an automated campaign based on trigger_type.
 * @param {Object} campaign - must have trigger_type and trigger_days
 * @returns {Array<{id, email, first_name}>}
 */
async function resolveTrigger(campaign) {
  const { trigger_type, trigger_days } = campaign;

  if (!trigger_type) return [];

  switch (trigger_type) {
    case 'post_course':
      return resolvePostCourseTrigger(trigger_days);

    case 'lapsed':
      return resolveSegment('lapsed_' + trigger_days);

    case 'credit_expiry':
      return resolveCreditExpiryTrigger(trigger_days);

    case 'welcome':
      return resolveWelcomeTrigger(trigger_days);

    default:
      console.warn(`[Campaign Cron] Unknown trigger_type: ${trigger_type}`);
      return [];
  }
}

/**
 * post_course: Enrollments completed exactly trigger_days ago (same calendar day).
 */
async function resolvePostCourseTrigger(triggerDays) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - triggerDays);
  const dateStr = targetDate.toISOString().split('T')[0];

  // Find enrollments that were marked completed on that date
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('student_id, customers!inner(id, email, first_name)')
    .eq('status', 'completed')
    .gte('updated_at', dateStr + 'T00:00:00.000Z')
    .lt('updated_at', dateStr + 'T23:59:59.999Z');

  if (error || !enrollments) return [];

  // Deduplicate by customer id
  const seen = new Set();
  return enrollments
    .filter(e => {
      const c = e.customers;
      if (!c || !c.email || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .map(e => ({ id: e.customers.id, email: e.customers.email, first_name: e.customers.first_name }));
}

/**
 * credit_expiry: Credits from credit_transactions where type='earn' and
 * expires_at is within trigger_days from now.
 */
async function resolveCreditExpiryTrigger(triggerDays) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + triggerDays);
  const dateStr = targetDate.toISOString().split('T')[0];

  const { data: transactions, error } = await supabase
    .from('credit_transactions')
    .select('customer_id, customers!inner(id, email, first_name)')
    .eq('type', 'earn')
    .gte('expires_at', dateStr + 'T00:00:00.000Z')
    .lt('expires_at', dateStr + 'T23:59:59.999Z');

  if (error || !transactions) return [];

  const seen = new Set();
  return transactions
    .filter(t => {
      const c = t.customers;
      if (!c || !c.email || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .map(t => ({ id: t.customers.id, email: t.customers.email, first_name: t.customers.first_name }));
}

/**
 * welcome: Enrollments created exactly trigger_days ago.
 */
async function resolveWelcomeTrigger(triggerDays) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - triggerDays);
  const dateStr = targetDate.toISOString().split('T')[0];

  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('student_id, customers!inner(id, email, first_name)')
    .gte('created_at', dateStr + 'T00:00:00.000Z')
    .lt('created_at', dateStr + 'T23:59:59.999Z');

  if (error || !enrollments) return [];

  const seen = new Set();
  return enrollments
    .filter(e => {
      const c = e.customers;
      if (!c || !c.email || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .map(e => ({ id: e.customers.id, email: e.customers.email, first_name: e.customers.first_name }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processCampaigns,
  sendCampaignToSegment,
  sendCampaignEmail,
  resolveTrigger,
};
