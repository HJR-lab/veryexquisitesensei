/**
 * The daily continuation sweep — what makes the offers automatic.
 *
 * Two jobs, in this order:
 *   1. Lapse offers whose deadline has passed, so the seat goes back.
 *   2. Offer the next course to every package student who is due one.
 *
 * Lapsing MUST run first. A live offer blocks a new one for the same cohort
 * (unique partial index on status='pending'), so an expired-but-still-pending
 * row would silently prevent that student ever being re-offered.
 *
 * Offers created here are AUTOMATED sends, so they respect the paused
 * 'continuation' email category. While paused, the sweep does all the matching
 * and creates every offer, but emails nobody — and reports what it would have
 * sent to info@ves.sg instead. That is the dry run: the picks are visible for
 * a few cohorts before a single student hears from it.
 */

const { supabase } = require('./supabaseDb');
const { resolveNextCourse } = require('./packageContinuation');
const { createContinuationOffer } = require('./continuationOffer');

/**
 * Close offers past their deadline. Idempotent — an already-lapsed row is not
 * matched again.
 * @returns {Promise<Array>} the offers that were lapsed
 */
async function lapseExpiredOffers() {
  const { data, error } = await supabase
    .from('continuation_offers')
    .update({ status: 'lapsed' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select();

  if (error) {
    console.error('[ContinuationSweep] lapse failed:', error.message);
    return [];
  }
  if (data?.length) {
    console.log(`[ContinuationSweep] lapsed ${data.length} expired offer(s) — seats released`);
  }
  return data || [];
}

/**
 * Email offers that exist but were never sent.
 *
 * An offer minted while automatic sending was off is otherwise stranded for
 * its whole life: createDueOffers skips that student as 'offer_exists' on every
 * later run, and nothing else ever looks at sent_at. The student hears nothing
 * until the offer expires and a fresh one is minted a week later — a week of
 * silence for someone whose seat is being held. April Koh and Ignacius Tay sat
 * in exactly that state after the 19/08 pause.
 *
 * Two deliberate exclusions:
 *
 * - extension_count > 0. An extension is the student saying "I know, give me a
 *   few days" from their own dashboard, where the offer appears whether or not
 *   an email went out. Writing to them cold would answer a question they never
 *   asked. They are already in the remindExtendedOffers path instead.
 * - an offer whose course no longer resolves. If the next cohort has filled or
 *   vanished since the row was written, "confirm your place" is a promise we
 *   cannot keep — better to leave it and let it lapse.
 *
 * @returns {Promise<Array>} the offer ids emailed
 */
async function sendUnsentOffers() {
  const { autosendStatus, sendOfferEmail } = require('./continuationOffer');

  const gate = autosendStatus();
  if (!gate.enabled) return [];

  const { data, error } = await supabase
    .from('continuation_offers')
    .select('*')
    .eq('status', 'pending')
    .is('sent_at', null)
    .eq('extension_count', 0)
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[ContinuationSweep] unsent query failed:', error.message);
    return [];
  }
  if (!data?.length) return [];

  const sent = [];
  for (const offer of data) {
    try {
      const { data: enrollment } = await supabase
        .from('course_enrollments')
        .select('*')
        .eq('id', offer.source_enrollment_id)
        .single();
      if (!enrollment) continue;

      const resolved = await resolveNextCourse(enrollment, offer.student_id);
      if (!resolved.ok) {
        console.log(`[ContinuationSweep] Unsent offer ${offer.id} left alone — ${resolved.reason}`);
        continue;
      }

      const result = await sendOfferEmail({
        offer,
        enrollment,
        currentCourseNumber: resolved.currentCourseNumber,
        automated: true,
      });
      if (result.emailed) {
        sent.push(offer.id);
        console.log(`[ContinuationSweep] Caught up unsent offer ${offer.id}`);
      }
    } catch (err) {
      // One bad row must never stop the sweep.
      console.error(`[ContinuationSweep] unsent offer ${offer.id} failed:`, err.message);
    }
  }
  return sent;
}

/**
 * The enrollment that describes where each package student is NOW.
 *
 * Status cannot be used to filter the query, only to judge the row we end up
 * with. Filtering on active/upcoming dropped everyone BETWEEN courses — their
 * last cohort is 'completed' and the next does not exist yet — which is
 * precisely the group the offer exists for. April Koh (1182) had finished 2 of
 * 3 and was invisible to the sweep for exactly this reason.
 *
 * So: read every non-cancelled package enrollment, take the newest per student,
 * and judge that one. Taking the newest first is what makes a pause stick — a
 * student whose latest cohort is paused must not be dragged back in by an older
 * active row sitting behind it.
 *
 * @returns {Promise<{due: Array, paused: Array}>}
 */
async function findDuePackageStudents() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .gte('package_total_courses', 2)
    .neq('status', 'cancelled');

  if (error) {
    console.error('[ContinuationSweep] enrollment query failed:', error.message);
    return { due: [], paused: [] };
  }

  const latest = new Map();
  for (const e of data || []) {
    const prev = latest.get(e.student_id);
    if (!prev || (e.course_start_date || '') > (prev.course_start_date || '')) {
      latest.set(e.student_id, e);
    }
  }

  const due = [];
  const paused = [];
  for (const e of latest.values()) {
    // A pause is a deliberate "not now". Respect it — resuming is an admin
    // action, not something a nightly job decides.
    if (e.status === 'paused') paused.push(e);
    else due.push(e);
  }
  return { due, paused };
}

/**
 * Offer the next course to everyone due one.
 *
 * Reasons a student is skipped are counted rather than logged individually —
 * "no cohort scheduled yet" is the normal state for most of them, not news.
 */
async function createDueOffers() {
  const { due: students, paused } = await findDuePackageStudents();
  const created = [];
  const skipped = {};
  if (paused.length) skipped.paused = paused.length;

  for (const enrollment of students) {
    const studentId = enrollment.student_id;
    try {
      const resolved = await resolveNextCourse(enrollment, studentId);
      if (!resolved.ok) {
        skipped[resolved.reason] = (skipped[resolved.reason] || 0) + 1;
        continue;
      }

      const result = await createContinuationOffer({ enrollment, studentId, automated: true });
      if (!result.ok) {
        skipped[result.reason] = (skipped[result.reason] || 0) + 1;
        continue;
      }

      created.push({
        offer: result.offer,
        emailed: result.emailed,
        studentName: `${enrollment.customers?.first_name || ''} ${enrollment.customers?.last_name || ''}`.trim(),
        studentEmail: enrollment.customers?.email || null,
      });
    } catch (err) {
      // One bad enrollment must never stop the sweep.
      console.error(`[ContinuationSweep] student ${studentId} failed:`, err.message);
      skipped.error = (skipped.error || 0) + 1;
    }
  }

  return { created, skipped, examined: students.length };
}

/**
 * Tell info@ves.sg what the sweep did.
 *
 * While the category is paused this IS the product: the list of students the
 * system would have written to, for Justin to send by hand and to check the
 * picks against what he would have done.
 */
function buildSweepReport({ created, skipped, examined, lapsed, caughtUp = [], paused, pausedReason, base }) {
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const fmt = d => d
    ? new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`)
        .toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
    : '';

  const rows = created.map(c => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(c.studentName)}<br/>
        <span style="color:#888;font-size:12px;">${esc(c.studentEmail)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(fmt(c.offer.first_class_date))}<br/>
        <span style="color:#888;font-size:12px;">${esc(c.offer.class_time)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">
        <a href="${base}/continue/${c.offer.token}">open link</a></td>
    </tr>`).join('');

  const header = paused
    ? `<p><strong>Automatic sending is off</strong> — these ${created.length} student(s) were NOT emailed.
       Each link below is live, so you can send it by hand.</p>
       <p style="color:#888;font-size:13px;">Reason: ${esc(pausedReason || 'unknown')}. Turn it on by setting
       <code>CONTINUATION_AUTOSEND=true</code>.</p>`
    : `<p>${created.length} continuation offer(s) emailed automatically.</p>`;

  const skipLine = Object.keys(skipped).length
    ? `<p style="color:#888;font-size:13px;">Examined ${examined} package student(s). Skipped: ${
        Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>`
    : `<p style="color:#888;font-size:13px;">Examined ${examined} package student(s).</p>`;

  const lapsedLine = lapsed.length
    ? `<p style="color:#888;font-size:13px;">${lapsed.length} offer(s) lapsed today — those seats are back.</p>`
    : '';

  // Caught-up offers are worth calling out separately: they are students who
  // had been waiting on an offer that existed but had never been sent.
  const caughtUpLine = caughtUp.length
    ? `<p style="color:#888;font-size:13px;">${caughtUp.length} offer(s) that had never been sent were emailed today.</p>`
    : '';

  const html = `${header}${
    created.length ? `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>` : ''
  }${skipLine}${caughtUpLine}${lapsedLine}`;

  return {
    subject: `VES: ${created.length} continuation offer(s)${paused ? ' ready to send' : ' sent'}`,
    html,
  };
}

async function reportSweep({ created, skipped, examined, lapsed, caughtUp = [] }) {
  if (created.length === 0 && lapsed.length === 0 && caughtUp.length === 0) return;

  const { sendEmail } = require('./emailService');
  const { publicBaseUrl } = require('./publicUrl');
  const { autosendStatus } = require('./continuationOffer');

  const gate = autosendStatus();
  const { subject, html } = buildSweepReport({
    created, skipped, examined, lapsed, caughtUp,
    paused: !gate.enabled,
    pausedReason: gate.reason,
    base: publicBaseUrl(),
  });

  await sendEmail({ to: 'info@ves.sg', subject, html });
}


/**
 * Nudge students who asked for more time and are about to run out.
 *
 * Only offers that were EXTENDED get one. Asking for +5 days is the signal
 * that someone means to say yes and might let it slip; a first-time offer gets
 * its three days and no chasing, which is what Justin wanted.
 *
 * Sent once per offer (reminder_sent_at), inside the last 24 hours, and
 * subject to the same autosend gate as the offer itself.
 */
async function remindExtendedOffers() {
  const { autosendStatus } = require('./continuationOffer');
  const { publicBaseUrl } = require('./publicUrl');

  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('continuation_offers')
    .select('*, customers!continuation_offers_student_id_fkey(first_name, email)')
    .eq('status', 'pending')
    .gte('extension_count', 1)
    .is('reminder_sent_at', null)
    .gt('expires_at', new Date().toISOString())
    .lt('expires_at', soon);

  if (error) {
    console.error('[ContinuationSweep] reminder query failed:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const gate = autosendStatus();
  const sent = [];

  for (const o of data) {
    if (!o.customers?.email) continue;

    if (!gate.enabled) {
      console.log(`[ContinuationSweep] Reminder for offer ${o.id} withheld — ${gate.reason}.`);
      continue;
    }

    const { sendEmail } = require('./emailService');
    const when = new Date(o.expires_at).toLocaleDateString('en-SG', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore',
    });
    const name = o.customers.first_name ? ` ${o.customers.first_name}` : '';
    const result = await sendEmail({
      to: o.customers.email,
      subject: 'Your place closes tomorrow',
      html: `<p style="font-size:15px;line-height:1.6;color:#282828;">Hi${name},</p>
             <p style="font-size:15px;line-height:1.6;color:#282828;">
               Just a note that the extra time you asked for runs out on <strong>${when}</strong>.
               After that we release your place to the next person.
             </p>
             <p style="font-size:15px;line-height:1.6;color:#282828;">
               One tap either way — confirm, or let us know it is not the right time:
             </p>
             <p><a href="${publicBaseUrl()}/continue/${o.token}"
                   style="display:inline-block;padding:12px 28px;background:#C4622D;color:#fff;
                          font-weight:600;text-decoration:none;border-radius:8px;">Confirm your place</a></p>
             <p style="font-size:13px;color:#888;">Your remaining courses do not expire either way.</p>`,
    });

    if (result.success) {
      await supabase.from('continuation_offers')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', o.id);
      sent.push(o.id);
      console.log(`[ContinuationSweep] Reminder sent for offer ${o.id}`);
    } else {
      console.error(`[ContinuationSweep] Reminder for offer ${o.id} failed: ${result.error}`);
    }
  }
  return sent;
}

/**
 * Entry point for the daily cron. Never throws.
 */
async function runContinuationSweep() {
  try {
    const lapsed = await lapseExpiredOffers();
    // After lapsing, so an offer past its deadline is released rather than
    // emailed; before creating, so a caught-up offer is not also re-minted.
    const caughtUp = await sendUnsentOffers();
    const reminded = await remindExtendedOffers();
    const { created, skipped, examined } = await createDueOffers();
    console.log(`[ContinuationSweep] examined ${examined}, created ${created.length}, lapsed ${lapsed.length}, caught up ${caughtUp.length}, reminded ${reminded.length}`);
    await reportSweep({ created, skipped, examined, lapsed, caughtUp });
    return { created, skipped, examined, lapsed, caughtUp };
  } catch (err) {
    console.error('[ContinuationSweep] failed:', err);
    return null;
  }
}

module.exports = {
  buildSweepReport,
  lapseExpiredOffers,
  sendUnsentOffers,
  remindExtendedOffers,
  findDuePackageStudents,
  createDueOffers,
  runContinuationSweep,
};
