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
    .select('id, status, booking_type, is_makeup_class, course_enrollment_id, customers:student_id(first_name, last_name, course_purchase_count)')
    .eq('class_instance_id', classInstance.id)
    .in('status', ['booked', 'completed', 'attended', 'forfeited', 'absent', 'rescheduled']);

  const eIds = [...new Set((bookings || []).filter(b => b.course_enrollment_id).map(b => b.course_enrollment_id))];
  let eMap = {};
  if (eIds.length > 0) {
    const { data: enrs } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_identifier, course_type, class_credits_allocated, class_credits_used, number_of_weeks')
      .in('id', eIds);
    // Compute credits per enrollment for progress display
    for (const enr of (enrs || [])) {
      const credits = await supabaseDb.getEnrollmentCredits(enr.id);
      enr.committedCount = credits.committed;
      enr.creditTotal = credits.allocated;
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
    // Build progress string: attended/total for HB and 10-class packages
    let progress = '';
    if (isHBEnrollment && enr.class_credits_allocated) {
      progress = ' ' + (enr.committedCount || 0) + '/' + (enr.creditTotal || enr.class_credits_allocated);
    } else if (is10ClassPkg) {
      progress = ' ' + (enr.committedCount || 0) + '/' + (enr.number_of_weeks || 10);
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
    summary: classInstance.class_type,
    description,
    location: 'VES Pottery Studio',
    start: { dateTime: date + 'T' + start, timeZone: TIMEZONE },
    end: { dateTime: date + 'T' + end, timeZone: TIMEZONE },
    reminders: { useDefault: false, overrides: [] }
  };
}

// Create or update a class instance's calendar event (only for today/future)
async function syncClassInstance(classInstanceId) {
  if (!isEnabled()) return;
  try {
    const { data: classInstance } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('id', classInstanceId)
      .single();
    if (!classInstance) return;

    // Skip past classes
    const today = new Date().toISOString().split('T')[0];
    const classDate = (classInstance.class_date || '').split('T')[0];
    if (classDate < today) return;

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
  } catch (err) {
    console.error('[CalendarSync] syncClassInstance error:', err.message);
  }
}

// Delete a class event
async function deleteClassInstance(classInstanceId) {
  if (!isEnabled()) return;
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

module.exports = {
  isEnabled,
  syncClassInstance,
  deleteClassInstance,
  syncStudioAccess,
  deleteStudioAccess
};
