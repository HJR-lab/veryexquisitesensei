/**
 * Generate .ics (iCalendar) files for class bookings
 * Compatible with Google Calendar, Apple Calendar, Outlook, etc.
 */

/**
 * Format date to iCalendar format: YYYYMMDDTHHMMSSZ
 */
function formatICalDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Generate UID for calendar event
 */
function generateUID(bookingId, classInstanceId) {
  return `booking-${bookingId}-class-${classInstanceId}@ves-pottery.com`;
}

/**
 * Escape special characters for iCalendar format
 */
function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Combine date and time strings into a Date object
 */
function combineDateTime(dateString, timeString) {
  const [hours, minutes] = timeString.split(':');
  const date = new Date(dateString);
  date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return date;
}

/**
 * Generate a single .ics file for a class booking
 */
function generateICS(booking, classInstance, studentInfo) {
  const startDateTime = combineDateTime(classInstance.classDate, classInstance.startTime);
  const endDateTime = combineDateTime(classInstance.classDate, classInstance.endTime);

  const dtStart = formatICalDate(startDateTime);
  const dtEnd = formatICalDate(endDateTime);
  const dtStamp = formatICalDate(new Date());
  const uid = generateUID(booking.id, classInstance.id);

  const summary = escapeICalText(`VES Pottery - ${classInstance.classType}`);
  const description = escapeICalText(
    `Pottery Class at VES\\n` +
    `Type: ${classInstance.classType}\\n` +
    `Instructor: ${classInstance.instructor}\\n\\n` +
    `Booking ID: ${booking.id}`
  );
  const location = escapeICalText('VES Pottery Studio, Singapore');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VES Pottery Studio//Class Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VES Pottery Classes',
    'X-WR-TIMEZONE:Asia/Singapore',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Pottery class reminder - tomorrow!',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Pottery class starts in 2 hours',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
}

/**
 * Generate a .ics file with multiple events (for downloading all bookings)
 */
function generateMultipleICS(bookingsWithClasses, studentInfo) {
  const dtStamp = formatICalDate(new Date());

  const events = bookingsWithClasses.map(({ booking, classInstance }) => {
    const startDateTime = combineDateTime(classInstance.classDate, classInstance.startTime);
    const endDateTime = combineDateTime(classInstance.classDate, classInstance.endTime);

    const dtStart = formatICalDate(startDateTime);
    const dtEnd = formatICalDate(endDateTime);
    const uid = generateUID(booking.id, classInstance.id);

    const summary = escapeICalText(`VES Pottery - ${classInstance.classType}`);
    const description = escapeICalText(
      `Pottery Class at VES\\n` +
      `Type: ${classInstance.classType}\\n` +
      `Instructor: ${classInstance.instructor}\\n\\n` +
      `Booking ID: ${booking.id}\\n` +
      `Status: ${booking.status}`
    );
    const location = escapeICalText('VES Pottery Studio, Singapore');

    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      `STATUS:${booking.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Pottery class reminder - tomorrow!',
      'END:VALARM',
      'END:VEVENT'
    ].join('\r\n');
  }).join('\r\n');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VES Pottery Studio//Class Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VES Pottery Classes',
    'X-WR-TIMEZONE:Asia/Singapore',
    events,
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
}

module.exports = {
  generateICS,
  generateMultipleICS
};
