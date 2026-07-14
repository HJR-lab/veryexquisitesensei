const { wrapEmailTemplate } = require('./base');

/**
 * Email sent to a purchaser whose order included an extra course spot.
 * We created a placeholder account for the second student; this email asks
 * the purchaser to fill in the second student's real details via a tokenized
 * public form (no login, no email back-and-forth).
 */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function generate({ purchaserFirstName, courseTitle, formUrl, studentCount = 1 }) {
  const many = studentCount > 1;
  const subject = many
    ? `VES: Who’s joining you? Details needed for ${studentCount} more students`
    : 'VES: Who’s joining you? Second student details needed';

  const greeting = purchaserFirstName ? `Hi ${esc(purchaserFirstName)},` : 'Hi,';
  const courseLine = courseTitle
    ? `your recent order for <strong>${esc(courseTitle)}</strong>`
    : 'your recent order';
  const spotsLine = many
    ? `includes <strong>${studentCount + 1} spots</strong>, so ${studentCount} more people will be joining you in the studio!`
    : `includes <strong>2 spots</strong>, so someone will be joining you in the studio!`;
  const setupLine = many
    ? `To set up each student’s own account (their class bookings, portfolio and studio updates), please tell us who they are. It takes under a minute:`
    : `To set up the second student’s own account (their class bookings, portfolio and studio updates), please tell us who they are. It takes under a minute:`;
  const holdLine = many
    ? `We’ll ask for each student’s name, email and mobile number. Until then, the extra spots stay reserved under your booking.`
    : `We’ll ask for their name, email and mobile number. Until then, the second spot stays reserved under your booking.`;

  const body = `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you — ${courseLine} ${spotsLine}
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${setupLine}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${formUrl}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Enter Student Details
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.7; color: #888888;">
      ${holdLine}
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
