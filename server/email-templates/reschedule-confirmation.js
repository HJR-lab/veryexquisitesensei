const { wrapEmailTemplate } = require('./base');

/**
 * Generate reschedule confirmation email — sent when a student reschedules a class to a makeup date
 */
function generate({ firstName, originalDate, newDate, newTime, courseIdentifier }) {
  const subject = `VES: Class Rescheduled — ${newDate}`;

  const body = `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Dear ${firstName},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Your class has been rescheduled. Here are the updated details:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFFBF5; border: 1px solid rgba(40,40,40,0.09); border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 12px; font-size: 14px; color: #282828;">
            <span style="font-weight: 600; color: #282828;">Original class:</span>&nbsp; ${originalDate}
          </p>
          <p style="margin: 0; font-size: 14px; color: #282828;">
            <span style="font-weight: 600; color: #C4622D;">New makeup class:</span>&nbsp; ${newDate}, ${newTime}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #282828;">
      Please arrive 10 minutes early to set up your workspace. If you need to reschedule again, please do so at least 24 hours in advance.
    </p>
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Address:</strong> 75 Jalan Kelabu Asap, Singapore 278257
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            View Your Bookings
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
