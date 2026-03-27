const { wrapEmailTemplate } = require('./base');

/**
 * Generate cohort confirmed email — sent when 4-student threshold is met
 */
function generateCohortConfirmedEmail({ courseType, courseTitle, dayOfWeek, startDate, endDate, timeSlot }) {
  const displayTitle = courseTitle || courseType || 'Wheelthrowing';
  const subject = `VES — Your ${displayTitle} is Confirmed!`;

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Your ${displayTitle} course is confirmed!
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Great news – your <strong>${displayTitle}</strong> has met all requirements and is good to proceed.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Schedule</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${dayOfWeek}s, ${startDate} – ${endDate}</p>
          <p style="margin: 0; font-size: 15px; color: #282828;">${timeSlot}</p>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)
    </p>
    <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #888888;">
      Nearest MRT: Holland Village &middot; No on-site parking
    </p>
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
      As a Ves &middot; Clay Club Member, you can:
    </p>
    <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Manage all course bookings</li>
      <li>Book additional unguided studio sessions</li>
      <li>Keep a gallery of your completed works</li>
      <li>Read our studio policies and much more!</li>
    </ul>
    <p style="margin: 0 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to seeing you at the studio!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Sign in
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateCohortConfirmedEmail };
