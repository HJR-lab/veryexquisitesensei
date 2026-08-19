/**
 * Continuation offers — asking the student instead of deciding for them.
 *
 * One offer is one question about one cohort: confirm, pass, or ask for more
 * time. It replaces the manual loop of emailing a package student, waiting for
 * a reply, and pressing Enroll.
 *
 * The clock is deliberate. A place is held while the offer is open, so silence
 * cannot hold a seat indefinitely: 3 days, extendable once by 5, then it lapses
 * and the seat goes back.
 */

const crypto = require('crypto');
const { supabase } = require('./supabaseDb');
const { publicBaseUrl } = require('./publicUrl');
const { resolveNextCourse, enrollInNextCourse } = require('./packageContinuation');

const OFFER_DAYS = 3;
const EXTENSION_DAYS = 5;
const MAX_EXTENSIONS = 1;

/**
 * May the nightly sweep email students?
 *
 * Opt-IN and explicit, on purpose. This used to ride on the 'continuation'
 * entry in the DEFAULT value of PAUSED_EMAIL_CATEGORIES — which an env var
 * silently overrides in full. Production had PAUSED_EMAIL_CATEGORIES set to
 * 'credits,waitlist', so the default never applied, the category was never
 * paused, and the sweep emailed two students during what was meant to be a dry
 * run. Everything passed locally, where no such env var exists.
 *
 * The lesson is the direction of the default. An absent or misspelt variable
 * must mean SILENCE, never "mail the customers". So sending now requires
 * CONTINUATION_AUTOSEND to be deliberately switched on, and PAUSED_EMAIL_
 * CATEGORIES survives as an independent kill switch: either can stop a send,
 * neither alone can start one.
 *
 * Admin-pressed offers are NOT automated sends and are unaffected — a human
 * clicking "Ask student" has already made the decision this gate protects.
 *
 * @returns {{enabled: boolean, reason: string|null}}
 */
function autosendStatus() {
  const raw = String(process.env.CONTINUATION_AUTOSEND ?? '').trim().toLowerCase();
  const on = raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  if (!on) {
    return { enabled: false, reason: `CONTINUATION_AUTOSEND is ${raw ? `"${raw}"` : 'not set'} — automatic sending is off` };
  }
  const { isEmailCategoryPaused } = require('./emailService');
  if (isEmailCategoryPaused('continuation')) {
    return { enabled: false, reason: "'continuation' is listed in PAUSED_EMAIL_CATEGORIES" };
  }
  return { enabled: true, reason: null };
}

const daysFromNow = n => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

/**
 * Create an offer for the student's next course and email them the link.
 *
 * @param {object} p
 * @param {object} p.enrollment  the student's CURRENT enrollment
 * @param {number} p.studentId
 * @param {boolean} [p.automated] set by the future auto-matcher; when true the
 *        send respects the paused 'continuation' email category. Admin-pressed
 *        offers are not automated sends and always go out.
 * @returns {Promise<{ok: boolean, reason?: string, offer?: object, emailed?: boolean}>}
 */
async function createContinuationOffer({ enrollment, studentId, automated = false }) {
  const resolved = await resolveNextCourse(enrollment, studentId);
  if (!resolved.ok) return { ok: false, reason: resolved.reason, seats: resolved.seats };

  const { nextCourse, firstClassDate, schedulePattern, classTime, remaining, currentCourseNumber } = resolved;
  const cohortStartDate = String(nextCourse.course_start_date).split(/[T ]/)[0];

  // One live offer per student per cohort. The unique partial index enforces
  // this too; checking first turns a constraint violation into a clear answer.
  const { data: existing } = await supabase
    .from('continuation_offers')
    .select('id')
    .eq('student_id', studentId)
    .eq('cohort_start_date', cohortStartDate)
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return { ok: false, reason: 'offer_exists' };

  const { data: offer, error } = await supabase
    .from('continuation_offers')
    .insert({
      token: crypto.randomBytes(24).toString('hex'),
      student_id: studentId,
      source_enrollment_id: enrollment.id,
      cohort_identifier: (nextCourse.course_identifier || '').split('.')[0] || null,
      cohort_start_date: cohortStartDate,
      first_class_date: firstClassDate || cohortStartDate,
      schedule_pattern: schedulePattern,
      class_time: classTime,
      status: 'pending',
      expires_at: daysFromNow(OFFER_DAYS),
    })
    .select()
    .single();
  if (error) throw error;

  const { data: student } = await supabase
    .from('customers')
    .select('email, first_name')
    .eq('id', studentId)
    .single();

  let emailed = false;
  if (student?.email) {
    const { sendEmail } = require('./emailService');
    const gate = automated ? autosendStatus() : { enabled: true, reason: null };
    if (!gate.enabled) {
      console.log(`[Continuation] Offer ${offer.id} created but NOT emailed — ${gate.reason}.`);
    } else {
      const template = require('../email-templates/continuation-offer');
      const { subject, html } = template.generate({
        firstName: student.first_name,
        startDate: firstClassDate || cohortStartDate,
        classTime,
        schedulePattern,
        courseNumber: currentCourseNumber + 1,
        totalCourses: enrollment.package_total_courses,
        deadlineIso: offer.expires_at,
        offerUrl: `${publicBaseUrl()}/continue/${offer.token}`,
      });
      const result = await sendEmail({ to: student.email, subject, html });
      emailed = !!result.success;
      if (emailed) {
        await supabase.from('continuation_offers')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', offer.id);
      } else {
        console.error(`[Continuation] Email to ${student.email} failed: ${result.error}`);
      }
    }
  }

  console.log(`[Continuation] Offer ${offer.id} for student ${studentId} → ${cohortStartDate} (${remaining} remaining)`);
  return { ok: true, offer, emailed };
}

/** Fetch an offer by its token, with the cohort details the page needs. */
async function getOfferByToken(token) {
  const { data, error } = await supabase
    .from('continuation_offers')
    .select('*, customers!continuation_offers_student_id_fkey(first_name)')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** An offer is only answerable while pending and unexpired. */
function offerState(offer) {
  if (!offer) return 'not_found';
  if (offer.status !== 'pending') return offer.status;
  if (new Date(offer.expires_at).getTime() < Date.now()) return 'lapsed';
  return 'pending';
}

/**
 * Record the student's answer.
 *
 * 'confirm' re-resolves and re-checks capacity through the shared module, so a
 * page opened days ago cannot place a student into a cohort that has since
 * filled.
 *
 * @param {string} token
 * @param {'confirm'|'pass'|'extend'} action
 */
async function respondToOffer(token, action) {
  const offer = await getOfferByToken(token);
  const state = offerState(offer);
  if (state !== 'pending') return { ok: false, reason: state };

  if (action === 'extend') {
    if (offer.extension_count >= MAX_EXTENSIONS) {
      return { ok: false, reason: 'no_extensions_left', offer };
    }
    const base = Math.max(Date.now(), new Date(offer.expires_at).getTime());
    const { data, error } = await supabase
      .from('continuation_offers')
      .update({
        expires_at: new Date(base + EXTENSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        extension_count: offer.extension_count + 1,
      })
      .eq('id', offer.id)
      .eq('status', 'pending')
      .select()
      .single();
    if (error) throw error;
    return { ok: true, action, offer: data };
  }

  if (action === 'pass') {
    // The course itself is not forfeited — only this cohort. They stay
    // eligible for the next one at their slot.
    const { data, error } = await supabase
      .from('continuation_offers')
      .update({ status: 'passed', responded_at: new Date().toISOString() })
      .eq('id', offer.id)
      .eq('status', 'pending')
      .select()
      .single();
    if (error) throw error;
    return { ok: true, action, offer: data };
  }

  if (action === 'confirm') {
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', offer.source_enrollment_id)
      .single();
    if (!enrollment) return { ok: false, reason: 'enrollment_missing' };

    const result = await enrollInNextCourse(enrollment, offer.student_id);
    if (!result.ok) {
      // Do NOT lapse the offer — a full cohort is an internal fault, and the
      // student should not lose their place because of it.
      console.error(`[Continuation] Confirm failed for offer ${offer.id}: ${result.reason}`);
      return { ok: false, reason: result.reason, internal: result.reason === 'cohort_full' };
    }

    const { data, error } = await supabase
      .from('continuation_offers')
      .update({
        status: 'confirmed',
        responded_at: new Date().toISOString(),
        created_enrollment_id: result.enrollment.id,
      })
      .eq('id', offer.id)
      .eq('status', 'pending')
      .select()
      .single();
    if (error) throw error;
    return { ok: true, action, offer: data, nextCourse: result.nextCourse };
  }

  return { ok: false, reason: 'unknown_action' };
}

module.exports = {
  autosendStatus,
  createContinuationOffer,
  getOfferByToken,
  offerState,
  respondToOffer,
  OFFER_DAYS,
  EXTENSION_DAYS,
  MAX_EXTENSIONS,
};
