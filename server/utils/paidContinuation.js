/**
 * Paid continuation — offering a current single-course student the next course
 * in their slot, with a checkout link and their seat held while they decide.
 *
 * Before this, a student who wanted to carry on had to spot the new dates on
 * Shopify and buy before the public did. Package students already had offers
 * (continuationOffer.js); this is the same offer for students who pay per
 * course, with one difference: confirming means paying.
 *
 * How the pieces fit:
 *   - The nightly sweep reads the Shopify catalogue (shopifyCourseCatalog.js)
 *     and finds the next listed course in each current student's slot.
 *   - The offer row lives in continuation_offers (kind = 'paid'), so the token
 *     page, the 3-day deadline, the one extension and the lapse all work as
 *     they do for packages.
 *   - The seat is held by a Shopify draft order with reserveInventoryUntil set
 *     to the offer's deadline. Shopify takes the reserved seat out of what the
 *     public can buy, and gives it back by itself if the reservation runs out.
 *   - The checkout link is the draft order's invoice URL, at the variant's own
 *     price — full price, by the owner's decision (26 Oct 2026).
 *   - Paying turns the draft into an ordinary order, so the existing order
 *     webhook enrols the student, they count toward the 4-student opening, and
 *     an under-filled cohort is postponed weekly exactly as before.
 *
 * Sending is opt-in, for the same reason as the package sweep: an absent or
 * misspelt variable must mean silence. With PAID_CONTINUATION_AUTOSEND off the
 * sweep creates nothing at all — no offer, no draft order, no held seat — and
 * only reports who it would have offered. Holding a real seat for a student who
 * was never told about it would cost a public sale for nothing.
 */

const crypto = require('crypto');
const { supabase } = require('./supabaseDb');
const { publicBaseUrl } = require('./publicUrl');
const { todaySGT, addDays, toYmd } = require('./sgtDate');
const { OFFER_DAYS } = require('./continuationOffer');

// How long after a course ends its students still count as "current". Covers
// the gap between courses, so a student whose course ended last week still
// hears about the next one.
const RECENT_DAYS = 21;

// The order note attribute that ties a paid order back to its offer.
const OFFER_ATTRIBUTE = 'ves_continuation_offer';

const daysFromNow = n => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

/**
 * May the sweep create paid offers and email students?
 * Mirrors autosendStatus() in continuationOffer.js, with its own switch so
 * package offers and paid offers can be turned on independently.
 */
function paidAutosendStatus() {
  const raw = String(process.env.PAID_CONTINUATION_AUTOSEND ?? '').trim().toLowerCase();
  const on = raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  if (!on) {
    return { enabled: false, reason: `PAID_CONTINUATION_AUTOSEND is ${raw ? `"${raw}"` : 'not set'} — paid offers are off` };
  }
  const { isEmailCategoryPaused } = require('./emailService');
  if (isEmailCategoryPaused('continuation')) {
    return { enabled: false, reason: "'continuation' is listed in PAUSED_EMAIL_CATEGORIES" };
  }
  return { enabled: true, reason: null };
}

/** A single paid course, not a package or a class pool. */
function isSingleCourse(e) {
  return !(e.package_total_courses > 1) && e.package_total_classes == null;
}

/** Last day of an enrollment, falling back to start + weeks when unset. */
function endDateOf(e) {
  const end = toYmd(e.course_end_date);
  if (end) return end;
  const start = toYmd(e.course_start_date);
  return start ? addDays(start, 7 * ((e.number_of_weeks || e.total_weeks || 6) - 1)) : null;
}

/**
 * The students to consider, one enrollment each: their newest WT course, if it
 * is a single course that has started and ended no more than RECENT_DAYS ago.
 *
 * Newest first, so a student who has already bought a later course (in any
 * slot) is judged by that one, which has not started, and drops out.
 * Pure, for tests.
 *
 * @param {Array} rows   non-cancelled WT course_enrollments
 * @param {string} today YYYY-MM-DD
 */
function pickCurrentEnrollments(rows, today) {
  const latest = new Map();
  for (const e of rows || []) {
    const prev = latest.get(e.student_id);
    if (!prev || (toYmd(e.course_start_date) || '') > (toYmd(prev.course_start_date) || '')) {
      latest.set(e.student_id, e);
    }
  }

  const current = [];
  for (const e of latest.values()) {
    if (e.status === 'paused' || e.status === 'cancelled') continue;
    if (!isSingleCourse(e)) continue;
    if (!e.schedule_pattern || !e.class_time) continue;
    const start = toYmd(e.course_start_date);
    const end = endDateOf(e);
    if (!start || !end || start > today) continue;
    if (end < addDays(today, -RECENT_DAYS)) continue;
    current.push(e);
  }
  return current;
}

/**
 * The next listed course in the student's slot. Pure, for tests.
 *
 * "Slot" is day and time, the same key the package continuation uses. When two
 * products are listed for the same slot and date, the one matching the
 * student's course type wins; if that still leaves a choice, nothing is
 * offered rather than guessing which course they meant.
 *
 * @returns {{ok: true, course: object} | {ok: false, reason: string}}
 */
function matchNextCourse(enrollment, catalog, today) {
  const end = endDateOf(enrollment) || today;
  const after = end > today ? end : today;
  const inSlot = (catalog || []).filter(c =>
    c.schedulePattern === enrollment.schedule_pattern &&
    c.classTime === enrollment.class_time &&
    c.startDate > after);
  if (inSlot.length === 0) return { ok: false, reason: 'no_listed_course' };

  const first = inSlot.reduce((min, c) => (c.startDate < min ? c.startDate : min), inSlot[0].startDate);
  const sameDate = inSlot.filter(c => c.startDate === first);
  if (sameDate.length === 1) return { ok: true, course: sameDate[0] };

  const sameType = sameDate.filter(c => c.courseType === enrollment.course_type);
  if (sameType.length === 1) return { ok: true, course: sameType[0] };
  return { ok: false, reason: 'ambiguous_listing' };
}

/**
 * Everything that must be true before a seat is held, besides the match.
 * @returns {Promise<{ok: boolean, reason?: string, seats?: object}>}
 */
async function checkOfferable(enrollment, course) {
  const studentId = enrollment.student_id;
  const key = {
    courseStartDate: course.startDate,
    schedulePattern: course.schedulePattern,
    classTime: course.classTime,
  };

  // One offer per student per cohort, ever. A student who passed, or let the
  // deadline go by, has had their answer heard; asking again every night would
  // be nagging. The next listing in their slot is a fresh question.
  const { data: prior, error: priorError } = await supabase
    .from('continuation_offers')
    .select('id')
    .eq('student_id', studentId)
    .eq('cohort_start_date', key.courseStartDate)
    .eq('schedule_pattern', key.schedulePattern)
    .eq('class_time', key.classTime)
    .limit(1);
  if (priorError) throw priorError;
  if (prior?.length) return { ok: false, reason: 'already_offered' };

  const { countCohortSignups } = require('./cohortCapacity');
  const { WT_SIGNUP_CAP } = require('../config/capacity');
  const { count, studentIds } = await countCohortSignups(key);
  if (studentIds.includes(studentId)) return { ok: false, reason: 'already_enrolled' };

  // Seats already held for other continuing students count as taken.
  const { data: held, error: heldError } = await supabase
    .from('continuation_offers')
    .select('student_id')
    .eq('status', 'pending')
    .eq('cohort_start_date', key.courseStartDate)
    .eq('schedule_pattern', key.schedulePattern)
    .eq('class_time', key.classTime)
    .gt('expires_at', new Date().toISOString());
  if (heldError) throw heldError;
  const heldCount = new Set((held || []).map(h => h.student_id).filter(id => !studentIds.includes(id))).size;

  const seats = { signups: count, held: heldCount, cap: WT_SIGNUP_CAP };
  if (count + heldCount >= WT_SIGNUP_CAP) return { ok: false, reason: 'cohort_full', seats };

  if (course.inventoryTracked && !course.oversellAllowed && (course.inventoryQuantity ?? 0) <= 0) {
    return { ok: false, reason: 'sold_out', seats };
  }
  return { ok: true, seats };
}

/** Shopify customer GID for a local customer, when it is a real Shopify id. */
function shopifyCustomerGid(student) {
  const id = String(student?.shopify_customer_id || '');
  return /^\d+$/.test(id) ? `gid://shopify/Customer/${id}` : null;
}

/**
 * Create the draft order that holds the seat and carries the checkout link.
 * Run once, never retried: a retry after a lost response would hold two seats.
 */
async function createHoldDraftOrder({ offer, course, student }) {
  const { shopifyGraphQL } = require('./shopifyGraphQL');
  const customerId = shopifyCustomerGid(student);
  const input = {
    lineItems: [{ variantId: course.variantId, quantity: 1 }],
    reserveInventoryUntil: offer.expires_at,
    customAttributes: [{ key: OFFER_ATTRIBUTE, value: String(offer.id) }],
    tags: ['continuation'],
    note: `Continuation offer ${offer.id}: seat held for a continuing student until ${offer.expires_at}.`,
    ...(customerId ? { purchasingEntity: { customerId } } : { email: student.email }),
  };

  const { body } = await shopifyGraphQL(`
    mutation holdSeat($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl }
        userErrors { field message }
      }
    }`, { input }, { attempts: 1 });

  const result = body?.data?.draftOrderCreate;
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map(e => e.message).join('; '));
  }
  if (!result?.draftOrder?.invoiceUrl) throw new Error('Shopify returned no checkout link');
  return { draftOrderId: result.draftOrder.id, checkoutUrl: result.draftOrder.invoiceUrl };
}

/**
 * Give a held seat back: delete the draft order. Safe to call on any offer.
 * A draft that was already paid cannot be deleted, and that is fine — the
 * error is logged and nothing else changes.
 */
async function releaseHold(offer) {
  if (!offer?.shopify_draft_order_id) return { released: false };
  try {
    const { shopifyGraphQL } = require('./shopifyGraphQL');
    const { body } = await shopifyGraphQL(`
      mutation releaseSeat($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) { deletedId userErrors { message } }
      }`, { input: { id: offer.shopify_draft_order_id } }, { attempts: 1 });
    const errors = body?.data?.draftOrderDelete?.userErrors || [];
    if (errors.length) {
      console.log(`[PaidContinuation] Draft for offer ${offer.id} not deleted: ${errors.map(e => e.message).join('; ')}`);
      return { released: false };
    }
    return { released: true };
  } catch (err) {
    console.error(`[PaidContinuation] Releasing hold for offer ${offer.id} failed:`, err.message);
    return { released: false };
  }
}

/** Move the reservation to the offer's new deadline after an extension. */
async function extendHold(offer) {
  if (!offer?.shopify_draft_order_id) return;
  try {
    const { shopifyGraphQL } = require('./shopifyGraphQL');
    const { body } = await shopifyGraphQL(`
      mutation extendSeat($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) { draftOrder { id } userErrors { message } }
      }`, { id: offer.shopify_draft_order_id, input: { reserveInventoryUntil: offer.expires_at } });
    const errors = body?.data?.draftOrderUpdate?.userErrors || [];
    if (errors.length) throw new Error(errors.map(e => e.message).join('; '));
  } catch (err) {
    // The offer is extended either way; only the Shopify hold may end early.
    console.error(`[PaidContinuation] Extending hold for offer ${offer.id} failed:`, err.message);
  }
}

/**
 * Offer one student one listed course: hold the seat, then email the link.
 *
 * @param {object} p
 * @param {object} p.enrollment  the student's current enrollment, with customers joined
 * @param {object} p.course      a parseCatalog() entry
 * @param {boolean} [p.automated] when true the email respects paidAutosendStatus
 */
async function createPaidOffer({ enrollment, course, automated = false }) {
  const student = enrollment.customers;
  if (!student?.email) return { ok: false, reason: 'no_email' };

  const { data: offer, error } = await supabase
    .from('continuation_offers')
    .insert({
      token: crypto.randomBytes(24).toString('hex'),
      student_id: enrollment.student_id,
      source_enrollment_id: enrollment.id,
      cohort_identifier: null,
      cohort_start_date: course.startDate,
      first_class_date: course.startDate,
      schedule_pattern: course.schedulePattern,
      class_time: course.classTime,
      status: 'pending',
      expires_at: daysFromNow(OFFER_DAYS),
      kind: 'paid',
      shopify_variant_id: course.variantId,
      price: course.price,
      course_title: course.productTitle,
    })
    .select()
    .single();
  if (error) {
    // The live-offer unique index: someone else got there first.
    if (error.code === '23505') return { ok: false, reason: 'offer_exists' };
    throw error;
  }

  let hold;
  try {
    hold = await createHoldDraftOrder({ offer, course, student });
  } catch (err) {
    // Nobody has heard about this offer yet, so remove it rather than leave a
    // pending row with no seat behind it.
    await supabase.from('continuation_offers').delete().eq('id', offer.id);
    console.error(`[PaidContinuation] Could not hold a seat for student ${enrollment.student_id}: ${err.message}`);
    return { ok: false, reason: 'shopify_error', error: err.message };
  }

  const { data: saved, error: saveError } = await supabase
    .from('continuation_offers')
    .update({ shopify_draft_order_id: hold.draftOrderId, checkout_url: hold.checkoutUrl })
    .eq('id', offer.id)
    .select()
    .single();
  if (saveError) {
    await releaseHold({ ...offer, shopify_draft_order_id: hold.draftOrderId });
    await supabase.from('continuation_offers').delete().eq('id', offer.id);
    throw saveError;
  }

  const { emailed, reason } = await sendPaidOfferEmail({ offer: saved, student, course, automated });
  console.log(`[PaidContinuation] Offer ${saved.id} for student ${enrollment.student_id} → ${course.startDate} ${course.schedulePattern} ${course.classTime}`);
  return { ok: true, offer: saved, emailed, emailReason: reason };
}

/** Email the student their offer. sent_at is stamped only once Resend accepts it. */
async function sendPaidOfferEmail({ offer, student, course, automated = false }) {
  const gate = automated ? paidAutosendStatus() : { enabled: true, reason: null };
  if (!gate.enabled) return { emailed: false, reason: gate.reason };

  const { sendEmail } = require('./emailService');
  const template = require('../email-templates/paid-continuation-offer');
  const { subject, html } = template.generate({
    firstName: student.first_name,
    courseTitle: course?.productTitle || offer.course_title,
    startDate: offer.first_class_date || offer.cohort_start_date,
    classTime: offer.class_time,
    numberOfWeeks: course?.numberOfWeeks || 6,
    price: offer.price,
    deadlineIso: offer.expires_at,
    offerUrl: `${publicBaseUrl()}/continue/${offer.token}`,
  });

  const result = await sendEmail({ to: student.email, subject, html });
  if (!result.success) {
    console.error(`[PaidContinuation] Email to ${student.email} failed: ${result.error}`);
    return { emailed: false, reason: result.error };
  }
  await supabase.from('continuation_offers')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', offer.id);
  return { emailed: true };
}

/**
 * Close the offer a paid order came from. Called by the order webhook once the
 * enrollment exists. Orders without the attribute are left alone; the nightly
 * closeFulfilledOffers still catches a student who bought some other way.
 */
async function linkPaidOrder(orderData, enrollmentId) {
  const attr = (orderData?.note_attributes || []).find(a => a?.name === OFFER_ATTRIBUTE);
  const offerId = parseInt(attr?.value, 10);
  if (!offerId) return null;

  const { data, error } = await supabase
    .from('continuation_offers')
    .update({
      status: 'confirmed',
      responded_at: new Date().toISOString(),
      created_enrollment_id: enrollmentId || null,
    })
    .eq('id', offerId)
    .eq('kind', 'paid')
    .in('status', ['pending', 'lapsed'])
    .select()
    .maybeSingle();
  if (error) {
    console.error(`[PaidContinuation] Linking order ${orderData.id} to offer ${offerId} failed:`, error.message);
    return null;
  }
  if (data) console.log(`[PaidContinuation] Offer ${offerId} paid — order ${orderData.id}, enrollment ${enrollmentId}`);
  return data;
}

/** Current single-course WT enrollments, with the student joined. */
async function loadCurrentEnrollments(today) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email, shopify_customer_id)')
    .ilike('course_type', 'Wheelthrowing%')
    .neq('status', 'cancelled')
    .not('course_start_date', 'is', null)
    .gte('course_start_date', addDays(today, -180));
  if (error) throw new Error(`Could not read enrollments: ${error.message}`);
  return pickCurrentEnrollments(data || [], today);
}

/**
 * What the sweep would offer, without changing anything.
 * @returns {Promise<{planned: Array, skipped: object, examined: number, listed: number}>}
 */
async function planPaidOffers({ catalog, today = todaySGT() } = {}) {
  const { fetchUpcomingWtCourses } = require('./shopifyCourseCatalog');
  const courses = catalog || await fetchUpcomingWtCourses();
  const students = await loadCurrentEnrollments(today);

  const planned = [];
  const skipped = {};
  const skip = r => { skipped[r] = (skipped[r] || 0) + 1; };

  for (const enrollment of students) {
    try {
      const match = matchNextCourse(enrollment, courses, today);
      if (!match.ok) { skip(match.reason); continue; }
      const check = await checkOfferable(enrollment, match.course);
      if (!check.ok) { skip(check.reason); continue; }
      planned.push({ enrollment, course: match.course, seats: check.seats });
    } catch (err) {
      console.error(`[PaidContinuation] student ${enrollment.student_id} failed:`, err.message);
      skip('error');
    }
  }
  return { planned, skipped, examined: students.length, listed: courses.length };
}

function buildPaidReport({ created, failed, planned, skipped, examined, listed, gate, catalogError }) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = d => d
    ? new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`)
        .toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
    : '';
  const name = e => `${e.customers?.first_name || ''} ${e.customers?.last_name || ''}`.trim() || `Student ${e.student_id}`;

  if (catalogError) {
    return {
      subject: 'VES: paid continuation could not read Shopify',
      html: `<p>The nightly paid continuation check could not read the course listings from Shopify, so nobody was offered anything.</p>
             <p style="color:#888;font-size:13px;">${esc(catalogError)}</p>
             <p style="color:#888;font-size:13px;">If this mentions access or scopes, the Shopify app needs the read_products and write_draft_orders permissions.</p>`,
    };
  }

  const rows = list => list.map(p => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(name(p.enrollment))}<br/>
        <span style="color:#888;font-size:12px;">${esc(p.enrollment.customers?.email)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(fmt(p.course.startDate))}<br/>
        <span style="color:#888;font-size:12px;">${esc(p.course.classTime)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#888;font-size:12px;">
        ${p.seats ? `${p.seats.signups} enrolled, ${p.seats.held} held` : ''}${p.error ? esc(p.error) : ''}</td>
    </tr>`).join('');

  const table = list => list.length ? `<table style="border-collapse:collapse;font-size:14px;">${rows(list)}</table>` : '';
  const skipLine = `<p style="color:#888;font-size:13px;">Looked at ${examined} current single-course student(s) against ${listed} listed course(s).${
    Object.keys(skipped).length ? ` Skipped: ${Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(', ')}.` : ''}</p>`;

  if (!gate.enabled) {
    return {
      subject: `VES: ${planned.length} student(s) could be offered their next course`,
      html: `<p><strong>Paid continuation is off</strong>, so nothing was sent and no seats were held.
             These ${planned.length} student(s) would have been offered the next course in their slot:</p>
             ${table(planned)}
             <p style="color:#888;font-size:13px;">Reason: ${esc(gate.reason)}. Turn it on by setting
             <code>PAID_CONTINUATION_AUTOSEND=true</code>. You can also send one by hand from the student's page.</p>
             ${skipLine}`,
    };
  }

  return {
    subject: `VES: ${created.length} continuation offer(s) sent with checkout links`,
    html: `<p>${created.length} student(s) were offered the next course in their slot. Each seat is held on Shopify until their deadline.</p>
           ${table(created)}
           ${failed.length ? `<p><strong>${failed.length} could not be offered</strong> because Shopify refused the hold:</p>${table(failed)}` : ''}
           ${skipLine}`,
  };
}

/**
 * Nightly entry point, called from runContinuationSweep. Never throws.
 *
 * With sending off it reports once a week (Mondays), so the dry run is visible
 * without the same list landing in the inbox every night.
 */
async function runPaidContinuationSweep({ today = todaySGT() } = {}) {
  try {
    if (!process.env.SHOPIFY_SHOP_DOMAIN || !process.env.SHOPIFY_ACCESS_TOKEN) return null;
    const gate = paidAutosendStatus();
    const { sendEmail } = require('./emailService');
    const isMonday = new Date(`${today}T12:00:00+08:00`).getUTCDay() === 1;

    let plan;
    try {
      plan = await planPaidOffers({ today });
    } catch (err) {
      console.error('[PaidContinuation] planning failed:', err.message);
      // Same weekly cadence as the dry-run report while sending is off.
      if (gate.enabled || isMonday) {
        const { subject, html } = buildPaidReport({ catalogError: err.message });
        await sendEmail({ to: 'info@ves.sg', subject, html });
      }
      return null;
    }

    const created = [];
    const failed = [];
    if (gate.enabled) {
      for (const p of plan.planned) {
        try {
          const result = await createPaidOffer({ enrollment: p.enrollment, course: p.course, automated: true });
          if (result.ok) created.push({ ...p, offer: result.offer });
          else if (result.reason === 'shopify_error') failed.push({ ...p, error: result.error });
        } catch (err) {
          console.error(`[PaidContinuation] offer for student ${p.enrollment.student_id} failed:`, err.message);
          failed.push({ ...p, error: err.message });
        }
      }
    }

    console.log(`[PaidContinuation] examined ${plan.examined}, listed ${plan.listed}, planned ${plan.planned.length}, created ${created.length}, failed ${failed.length}`);

    const worthReporting = gate.enabled
      ? (created.length > 0 || failed.length > 0)
      : (plan.planned.length > 0 && isMonday);
    if (worthReporting) {
      const { subject, html } = buildPaidReport({ ...plan, created, failed, gate });
      await sendEmail({ to: 'info@ves.sg', subject, html });
    }
    return { ...plan, created, failed };
  } catch (err) {
    console.error('[PaidContinuation] sweep failed:', err);
    return null;
  }
}

module.exports = {
  OFFER_ATTRIBUTE,
  RECENT_DAYS,
  paidAutosendStatus,
  pickCurrentEnrollments,
  matchNextCourse,
  checkOfferable,
  createPaidOffer,
  releaseHold,
  extendHold,
  linkPaidOrder,
  planPaidOffers,
  buildPaidReport,
  runPaidContinuationSweep,
};
