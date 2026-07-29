// Google Calendar sync utility
// Syncs class_instances and studio_access_bookings to the info@ves.sg primary calendar

const { google } = require('googleapis');
const supabaseDb = require('./supabaseDb');

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
if (REFRESH_TOKEN) {
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
}

const cal = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = 'primary';
const TIMEZONE = 'Asia/Singapore';

function isEnabled() {
  return !!REFRESH_TOKEN;
}

// Per-class_instance sync serialization.
// Two concurrent syncs for the same class_instance race in two ways:
//   1. Both see google_calendar_event_id=null and INSERT — second event is orphaned.
//   2. Both UPDATE — older-read description overwrites newer-read.
// We chain syncs by id so only one runs at a time per class_instance.
const syncChains = new Map();
function withClassInstanceLock(id, fn) {
  const prev = syncChains.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  syncChains.set(id, next);
  next.finally(() => { if (syncChains.get(id) === next) syncChains.delete(id); });
  return next;
}

function getBase(id) {
  if (!id) return '';
  const i = id.lastIndexOf('.');
  return i > 0 ? id.substring(0, i) : id;
}

function parseTime(t) {
  if (!t) return '00:00:00';
  // Handle "1:00 PM" / "9:30 AM" or already in HH:MM
  const m = String(t).match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return t;
  let h = parseInt(m[1]);
  if (m[3]) {
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return String(h).padStart(2, '0') + ':' + m[2] + ':00';
}

async function buildClassDescription(classInstance) {
  const { data: bookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id, status, booking_type, is_makeup_class, course_enrollment_id, student_id, customers:student_id(first_name, last_name, course_purchase_count)')
    .eq('class_instance_id', classInstance.id)
    .in('status', ['booked', 'completed', 'attended', 'forfeited', 'absent', 'rescheduled']);

  const eIds = [...new Set((bookings || []).filter(b => b.course_enrollment_id).map(b => b.course_enrollment_id))];
  let eMap = {};
  if (eIds.length > 0) {
    const { data: enrs } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_identifier, course_type, class_credits_allocated, class_credits_used, number_of_weeks, total_weeks, student_id')
      .in('id', eIds);
    // Compute progress per enrollment: count bookings up to and including this class's date
    const classDateStr = (classInstance.class_date || '').split(/[T ]/)[0];
    for (const enr of (enrs || [])) {
      const credits = await supabaseDb.getEnrollmentCredits(enr.id);
      enr.creditTotal = credits.allocated;
      // Count bookings with class_date <= this class's date for positional progress
      const { data: progressBookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
        .eq('course_enrollment_id', enr.id)
        .in('status', ['attended', 'completed', 'booked']);
      enr.classPosition = (progressBookings || []).filter(b => {
        const d = (b.class_instances?.class_date || '').split(/[T ]/)[0];
        return d && d <= classDateStr;
      }).length;

      // For 10-class packages: if student has another active enrollment,
      // show combined progress (current enrollment + flex credits used)
      if (enr.number_of_weeks === 10 && enr.student_id) {
        const coreWeeks = enr.total_weeks || 6;
        const flexTotal = 10 - coreWeeks;
        const { data: otherEnrs } = await supabaseDb.supabase
          .from('course_enrollments')
          .select('id, number_of_weeks')
          .eq('student_id', enr.student_id)
          .eq('status', 'active')
          .neq('id', enr.id)
          .neq('number_of_weeks', 10)
          .limit(1);
        if (otherEnrs && otherEnrs.length > 0) {
          const otherEnr = otherEnrs[0];
          // Count other enrollment's bookings up to this class date
          const { data: otherBookings } = await supabaseDb.supabase
            .from('bookings')
            .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
            .eq('course_enrollment_id', otherEnr.id)
            .in('status', ['attended', 'completed', 'booked']);
          const otherProgress = (otherBookings || []).filter(b => {
            const d = (b.class_instances?.class_date || '').split(/[T ]/)[0];
            return d && d <= classDateStr;
          }).length;
          const flexUsed = Math.max(0, enr.classPosition - coreWeeks);
          enr.combinedProgress = otherProgress + flexUsed;
          enr.combinedTotal = otherEnr.number_of_weeks + flexTotal;
        }
      }

      eMap[enr.id] = enr;
    }
  }

  const isHBClass = (classInstance.class_type || '').toUpperCase().startsWith('HB');
  const classBase = getBase(classInstance.class_type);
  const enrolled = [], makeup = [], rescheduled = [];

  (bookings || []).forEach(b => {
    const enr = eMap[b.course_enrollment_id] || {};
    const isHBEnrollment = (enr.course_type || '').toLowerCase().includes('handbuilding');
    const is10ClassPkg = enr.number_of_weeks === 10;
    const enrBase = enr.course_identifier ? getBase(enr.course_identifier) : null;
    // HB students are always "enrolled" (drop-in credits), not makeup
    const isMakeup = !isHBClass && !isHBEnrollment && !is10ClassPkg && (b.booking_type === 'makeup' || b.is_makeup_class || (enrBase && classBase && enrBase !== classBase));
    const isResched = b.status === 'rescheduled' || b.status === 'absent';
    const name = ((b.customers?.first_name || '') + ' ' + (b.customers?.last_name || '')).trim();
    const ord = b.customers?.course_purchase_count || 0;
    // Build progress string: class position / total (how many classes up to this date)
    let progress = '';
    if (isHBEnrollment && enr.class_credits_allocated) {
      progress = ' ' + (enr.classPosition || 0) + '/' + (enr.creditTotal || enr.class_credits_allocated);
    } else if (is10ClassPkg && enr.combinedProgress !== undefined) {
      progress = ' ' + enr.combinedProgress + '/' + enr.combinedTotal;
    } else if (is10ClassPkg) {
      progress = ' ' + (enr.classPosition || 0) + '/' + (enr.number_of_weeks || 10);
    } else if (enr.number_of_weeks) {
      progress = ' ' + (enr.classPosition || 0) + '/' + enr.number_of_weeks;
    }
    if (isResched) rescheduled.push({ name, ord, progress });
    else if (isMakeup) makeup.push({ name, ord, from: enr.course_identifier || '', progress });
    else enrolled.push({ name, ord, progress });
  });

  enrolled.sort((a, b) => b.ord - a.ord || a.name.localeCompare(b.name));
  makeup.sort((a, b) => b.ord - a.ord || a.name.localeCompare(b.name));

  let desc = 'Instructor: ' + (classInstance.instructor || 'TBC') + '\n\n';
  desc += 'ENROLLED\n';
  if (enrolled.length === 0) desc += '(none)\n';
  enrolled.forEach((s, i) => { desc += (i + 1) + '. ' + s.name + ' (' + s.ord + ')' + s.progress + '\n'; });
  if (makeup.length) {
    desc += '\nMAKEUP\n';
    makeup.forEach((s, i) => {
      desc += (enrolled.length + i + 1) + '. ' + s.name + ' (' + s.ord + ')' + (s.from ? ' · ' + s.from : '') + s.progress + '\n';
    });
  }
  if (rescheduled.length) {
    desc += '\nRESCHEDULED\n';
    rescheduled.forEach(s => { desc += s.name + ' (' + s.ord + ')\n'; });
  }
  return desc;
}

function buildEventPayload(classInstance, description) {
  const date = (classInstance.class_date || '').split('T')[0];
  const start = parseTime(classInstance.start_time);
  const end = parseTime(classInstance.end_time);
  return {
    summary: classInstance.status === 'cancelled'
      ? classInstance.class_type + ' [CANCELLED]'
      : classInstance.class_type,
    description,
    location: 'VES Pottery Studio',
    start: { dateTime: date + 'T' + start, timeZone: TIMEZONE },
    end: { dateTime: date + 'T' + end, timeZone: TIMEZONE },
    reminders: { useDefault: false, overrides: [] }
  };
}

// Create or update a class instance's calendar event (only for today/future)
// Returns a status object so callers can await sync and surface partial failures
// instead of abandoning an unawaited promise:
//   { status: 'ok' | 'skipped' | 'failed', classInstanceId, reason?/error? }
async function syncClassInstance(classInstanceId) {
  if (!isEnabled()) return { status: 'skipped', classInstanceId, reason: 'calendar_disabled' };
  return withClassInstanceLock(classInstanceId, async () => {
    try {
      // Re-read inside the lock so the second waiter sees the event_id the
      // first waiter just wrote (otherwise both INSERT and one is orphaned).
      const { data: classInstance } = await supabaseDb.supabase
        .from('class_instances')
        .select('*')
        .eq('id', classInstanceId)
        .single();
      if (!classInstance) return { status: 'skipped', classInstanceId, reason: 'not_found' };

      // Skip past classes
      const today = new Date().toISOString().split('T')[0];
      const classDate = (classInstance.class_date || '').split('T')[0];
      if (classDate < today) return { status: 'skipped', classInstanceId, reason: 'past_class' };

      const description = await buildClassDescription(classInstance);
      const payload = buildEventPayload(classInstance, description);

      if (classInstance.google_calendar_event_id) {
        // Update existing
        await cal.events.update({
          calendarId: CALENDAR_ID,
          eventId: classInstance.google_calendar_event_id,
          resource: payload
        });
      } else {
        // Create new
        const res = await cal.events.insert({
          calendarId: CALENDAR_ID,
          resource: payload
        });
        await supabaseDb.supabase
          .from('class_instances')
          .update({ google_calendar_event_id: res.data.id })
          .eq('id', classInstanceId);
      }
      return { status: 'ok', classInstanceId };
    } catch (err) {
      console.error('[CalendarSync] syncClassInstance error:', err.message);
      return { status: 'failed', classInstanceId, error: err.message };
    }
  });
}

// Fold an array of syncClassInstance results (or Promise.allSettled results) into
// a compact partial-failure summary for an HTTP response.
function summarizeSyncResults(results) {
  const normalized = (results || []).map((r) => {
    if (r && r.status === 'fulfilled') return r.value || { status: 'skipped' };
    if (r && r.status === 'rejected') {
      return { status: 'failed', error: r.reason && r.reason.message ? r.reason.message : String(r.reason) };
    }
    return r || { status: 'skipped' };
  });
  const failures = normalized.filter((r) => r.status === 'failed');
  return {
    ok: normalized.filter((r) => r.status === 'ok').length,
    failed: failures.length,
    skipped: normalized.filter((r) => r.status === 'skipped').length,
    total: normalized.length,
    allOk: failures.length === 0,
    failures: failures.map((f) => ({ classInstanceId: f.classInstanceId, error: f.error })),
  };
}

// Delete a class event
async function deleteClassInstance(classInstanceId) {
  if (!isEnabled()) return;
  return withClassInstanceLock(classInstanceId, async () => {
    try {
      const { data: classInstance } = await supabaseDb.supabase
        .from('class_instances')
        .select('google_calendar_event_id')
        .eq('id', classInstanceId)
        .single();
      if (!classInstance?.google_calendar_event_id) return;
      await cal.events.delete({
        calendarId: CALENDAR_ID,
        eventId: classInstance.google_calendar_event_id
      });
      await supabaseDb.supabase
        .from('class_instances')
        .update({ google_calendar_event_id: null })
        .eq('id', classInstanceId);
    } catch (err) {
      console.error('[CalendarSync] deleteClassInstance error:', err.message);
    }
  });
}

// Create/update studio access booking event
async function syncStudioAccess(bookingId) {
  if (!isEnabled()) return;
  try {
    const { data: b } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*, customers(first_name, last_name, email)')
      .eq('id', bookingId)
      .single();
    if (!b) return;

    const name = ((b.customers?.first_name || '') + ' ' + (b.customers?.last_name || '')).trim();
    const date = b.booking_date;
    const start = b.start_time.includes(':') && b.start_time.split(':').length === 2 ? b.start_time + ':00' : b.start_time;

    let end;
    if (b.end_time) {
      end = b.end_time.includes(':') && b.end_time.split(':').length === 2 ? b.end_time + ':00' : b.end_time;
    } else if (b.hours > 0) {
      const [h, m] = b.start_time.split(':').map(Number);
      end = String(h + b.hours).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
    } else {
      const [h, m] = b.start_time.split(':').map(Number);
      end = String(h + 2).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
    }

    let desc = 'Studio Access Booking\n\n';
    desc += 'Student: ' + name + '\n';
    if (b.customers?.email) desc += 'Email: ' + b.customers.email + '\n';
    if (b.hours > 0) desc += 'Hours: ' + b.hours + '\n';
    if (b.amount_sgd > 0) desc += 'Amount: SGD ' + b.amount_sgd + '\n';
    if (b.credit_applied > 0) desc += 'Credit applied: SGD ' + b.credit_applied + '\n';
    if (b.notes) desc += 'Notes: ' + b.notes + '\n';

    const payload = {
      summary: 'STUDIO · ' + name,
      description: desc,
      location: 'VES Pottery Studio',
      start: { dateTime: date + 'T' + start, timeZone: TIMEZONE },
      end: { dateTime: date + 'T' + end, timeZone: TIMEZONE },
      colorId: '8',
      reminders: { useDefault: false, overrides: [] }
    };

    if (b.google_calendar_event_id) {
      await cal.events.update({
        calendarId: CALENDAR_ID,
        eventId: b.google_calendar_event_id,
        resource: payload
      });
    } else {
      const res = await cal.events.insert({
        calendarId: CALENDAR_ID,
        resource: payload
      });
      await supabaseDb.supabase
        .from('studio_access_bookings')
        .update({ google_calendar_event_id: res.data.id })
        .eq('id', bookingId);
    }
  } catch (err) {
    console.error('[CalendarSync] syncStudioAccess error:', err.message);
  }
}

// Delete studio access event
async function deleteStudioAccess(bookingId) {
  if (!isEnabled()) return;
  try {
    const { data: b } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('google_calendar_event_id')
      .eq('id', bookingId)
      .single();
    if (!b?.google_calendar_event_id) return;
    await cal.events.delete({
      calendarId: CALENDAR_ID,
      eventId: b.google_calendar_event_id
    });
    await supabaseDb.supabase
      .from('studio_access_bookings')
      .update({ google_calendar_event_id: null })
      .eq('id', bookingId);
  } catch (err) {
    console.error('[CalendarSync] deleteStudioAccess error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Membership term markers
// ---------------------------------------------------------------------------
// Each active membership shows up on the studio calendar as TWO all-day events:
// a START marker on start_date and an END/expiry marker on end_date. This gives
// the admin an at-a-glance view of when terms begin and when they lapse (for
// renewals) without cluttering every day in between.

// Add N days to a YYYY-MM-DD string and return YYYY-MM-DD. Used to build the
// exclusive end.date for an all-day Google Calendar event (a single all-day
// event on date D has start.date=D, end.date=D+1). UTC math so a bare date
// never shifts a day due to the server's timezone.
function addDaysStr(dateStr, days) {
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

// Build an all-day event payload for a membership marker on a single date.
function buildMembershipMarker(dateStr, summary, description, colorId) {
  const date = String(dateStr).split('T')[0];
  return {
    summary,
    description,
    location: 'VES Pottery Studio',
    start: { date },
    end: { date: addDaysStr(date, 1) },
    colorId,
    transparency: 'transparent', // shows as "free", not a busy block
    reminders: { useDefault: false, overrides: [] }
  };
}

// Create/update the two all-day term markers for a membership. Only active
// memberships with both dates get markers; pending/cancelled/expired ones have
// their markers removed so the calendar reflects the current entitlement.
async function syncMembership(membershipId) {
  if (!isEnabled()) return { status: 'skipped', membershipId, reason: 'calendar_disabled' };
  try {
    const { data: m } = await supabaseDb.supabase
      .from('memberships')
      .select('*, customer:customers!memberships_customer_id_fkey(first_name, last_name, email)')
      .eq('id', membershipId)
      .single();
    if (!m) return { status: 'skipped', membershipId, reason: 'not_found' };

    // Only active terms with both dates belong on the calendar. Anything else
    // (pending with no dates yet, cancelled, expired-and-deleted) gets cleaned up.
    const eligible = m.status === 'active' && m.start_date && m.end_date;
    if (!eligible) {
      await deleteMembershipEvents(membershipId);
      return { status: 'skipped', membershipId, reason: `not_eligible:${m.status}` };
    }

    const name = ((m.customer?.first_name || '') + ' ' + (m.customer?.last_name || '')).trim() || 'Member';
    const type = m.membership_type || 'Membership';
    const startStr = String(m.start_date).split('T')[0];
    const endStr = String(m.end_date).split('T')[0];

    let desc = 'VES Membership\n\n';
    desc += 'Member: ' + name + '\n';
    if (m.customer?.email) desc += 'Email: ' + m.customer.email + '\n';
    desc += 'Type: ' + type + '\n';
    desc += 'Term: ' + startStr + ' → ' + endStr + '\n';
    if (m.gifted_by_customer_id) desc += 'Gifted membership\n';

    const markers = [
      { dateStr: startStr, idCol: 'google_calendar_start_event_id',
        summary: '🎟 ' + name + ' — ' + type + ' (starts)', colorId: '10' /* Basil green */ },
      { dateStr: endStr, idCol: 'google_calendar_end_event_id',
        summary: '⏳ ' + name + ' — ' + type + ' (ends)', colorId: '11' /* Tomato red */ },
    ];

    for (const mk of markers) {
      const payload = buildMembershipMarker(mk.dateStr, mk.summary, desc, mk.colorId);
      const existingId = m[mk.idCol];
      if (existingId) {
        try {
          await cal.events.update({ calendarId: CALENDAR_ID, eventId: existingId, resource: payload });
          continue;
        } catch (err) {
          // Event was deleted upstream (404/410) — fall through and re-create.
          if (![404, 410].includes(err.code)) throw err;
        }
      }
      const res = await cal.events.insert({ calendarId: CALENDAR_ID, resource: payload });
      await supabaseDb.supabase
        .from('memberships')
        .update({ [mk.idCol]: res.data.id })
        .eq('id', membershipId);
    }
    return { status: 'ok', membershipId };
  } catch (err) {
    console.error('[CalendarSync] syncMembership error:', err.message);
    return { status: 'failed', membershipId, error: err.message };
  }
}

// Remove both term markers (on cancel, delete, or when a membership becomes
// ineligible). Clears the stored ids so a later re-activation re-creates fresh.
async function deleteMembershipEvents(membershipId) {
  if (!isEnabled()) return;
  try {
    const { data: m } = await supabaseDb.supabase
      .from('memberships')
      .select('google_calendar_start_event_id, google_calendar_end_event_id')
      .eq('id', membershipId)
      .single();
    if (!m) return;
    for (const col of ['google_calendar_start_event_id', 'google_calendar_end_event_id']) {
      if (!m[col]) continue;
      try {
        await cal.events.delete({ calendarId: CALENDAR_ID, eventId: m[col] });
      } catch (err) {
        if (![404, 410].includes(err.code)) throw err;
      }
      await supabaseDb.supabase
        .from('memberships')
        .update({ [col]: null })
        .eq('id', membershipId);
    }
  } catch (err) {
    console.error('[CalendarSync] deleteMembershipEvents error:', err.message);
  }
}

// Nightly self-heal: re-sync every active membership so term markers stay in
// place even if a fire-and-forget syncMembership() call failed. Idempotent
// (updates existing events in place).
async function resyncMemberships() {
  if (!isEnabled()) return { synced: 0, skipped: true };
  const { data: memberships, error } = await supabaseDb.supabase
    .from('memberships')
    .select('id')
    .eq('status', 'active');
  if (error) {
    console.error('[CalendarSync] resyncMemberships query failed:', error.message);
    return { synced: 0, error: error.message };
  }
  let synced = 0;
  for (const m of (memberships || [])) {
    await syncMembership(m.id);
    synced++;
  }
  console.log(`[CalendarSync] resyncMemberships re-synced ${synced} active memberships`);
  return { synced };
}

// Re-sync every upcoming class_instance's calendar event so descriptions stay
// current. Necessary because an event's roster/progress string is derived from
// state that changes WITHOUT touching that class_instance directly:
//   - progress positions count bookings across the whole enrollment, so any
//     booking change on a peer class invalidates this class's string;
//   - the daily auto-attendance job flips earlier bookings booked->attended,
//     shifting progress on later classes that never get re-synced;
//   - fire-and-forget syncClassInstance() calls can fail silently.
// Per-instance syncs are idempotent (they update the existing event in place and
// skip past classes), so a nightly sweep self-heals all drift within 24h.
async function resyncUpcoming() {
  if (!isEnabled()) return { synced: 0, skipped: true };
  const today = new Date().toISOString().split('T')[0];
  const { data: classes, error } = await supabaseDb.supabase
    .from('class_instances')
    .select('id')
    .gte('class_date', today)
    .order('class_date', { ascending: true });
  if (error) {
    console.error('[CalendarSync] resyncUpcoming query failed:', error.message);
    return { synced: 0, error: error.message };
  }
  let synced = 0;
  for (const ci of (classes || [])) {
    // await sequentially so we respect the per-instance lock and don't burst
    // the Google API; syncClassInstance swallows its own errors.
    await syncClassInstance(ci.id);
    synced++;
  }
  console.log(`[CalendarSync] resyncUpcoming re-synced ${synced} upcoming class instances`);
  return { synced };
}

module.exports = {
  isEnabled,
  syncClassInstance,
  summarizeSyncResults,
  deleteClassInstance,
  syncStudioAccess,
  deleteStudioAccess,
  buildClassDescription,
  resyncUpcoming,
  syncMembership,
  deleteMembershipEvents,
  resyncMemberships
};
