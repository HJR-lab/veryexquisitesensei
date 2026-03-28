const { wrapEmailTemplate } = require('../base');

/**
 * Generate course detail email for 10-Class Wheelthrowing package
 */
function generate({ dayOfWeek, startDate, endDate, timeSlot, holidayExclusions, specialNotes }) {
  const subject = `VES Course Details: 10-Class Wheelthrowing — ${dayOfWeek}s, ${startDate} - ${endDate} (${timeSlot})`;

  const holidayLine = holidayExclusions
    ? `<p style="margin: 0 0 2px; font-size: 14px; color: #282828;"><strong>Holiday exclusions:</strong> ${holidayExclusions}</p>`
    : '';

  const specialNotesBlock = specialNotes
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF8F5; border-left: 3px solid #C4622D; border-radius: 4px; margin: 0 0 20px;">
        <tr>
          <td style="padding: 12px 16px;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Note</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">${specialNotes}</p>
          </td>
        </tr>
      </table>`
    : '';

  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      10-Class Wheelthrowing
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888; text-align: center;">Course Details</p>

    ${specialNotesBlock}

    <!-- Schedule Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your Schedule</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${dayOfWeek}s, ${startDate} – ${endDate}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${timeSlot}</p>
          <p style="margin: 0 0 2px; font-size: 14px; color: #282828;">6 structured weeks + 4 flexible classes (WT or HB)</p>
          ${holidayLine}
        </td>
      </tr>
    </table>

    <!-- Punctuality -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</p>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #282828;">
      The studio opens for entry <strong>10 minutes before class begins</strong>. Please arrive on time as latecomers may miss important instructions.
    </p>

    <!-- Items Required -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</p>
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.7; color: #282828;">The following items are required and available for purchase at the studio:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #282828;">Tool kit + apron bundle</td>
        <td style="padding: 4px 0; font-size: 14px; color: #282828; text-align: right;">$45</td>
      </tr>
    </table>

    <!-- Policies link -->
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #282828;">
      For make-up class policy, studio rules, and other information, visit <a href="https://club.ves.sg/policies" style="color: #C4622D;">club.ves.sg/policies</a>
    </p>

    <!-- Address -->
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Studio Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens, Singapore 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a>)
    </p>

    <!-- Sign-off -->
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #282828;">
      Looking forward to seeing you in class!<br />
      <strong>Eve</strong><br />
      Ves Studio
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Manage Your Bookings
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
