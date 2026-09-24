const { wrapEmailTemplate, esc, escUrl } = require('./base');

/**
 * Welcome email for a student whose spot someone else bought (the "+1" on a
 * multi-spot order). Sent once the purchaser has filled in the student-details
 * form, to the student's own address. Until then the student had a placeholder
 * account and was never written to, so this is their first word from VES.
 */
function generate({ firstName, purchaserName, courseTitle, signInUrl }) {
  const subject = courseTitle
    ? `Welcome to VES — you’re booked into ${courseTitle}`
    : 'Welcome to VES — your spot is booked';

  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const byLine = purchaserName ? `<strong>${esc(purchaserName)}</strong> has booked you` : 'You’ve been booked';
  const courseLine = courseTitle ? `a spot in <strong>${esc(courseTitle)}</strong>` : 'a spot in one of our courses';
  const url = escUrl(signInUrl);

  const body = `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${byLine} ${courseLine} at VES. Welcome to the studio!
    </p>
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
      Your Ves &middot; Clay Club account is ready. Sign in with this email address to:
    </p>
    <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Manage all your course bookings</li>
      <li>Book additional unguided studio sessions</li>
      <li>Keep a gallery of your completed works</li>
      <li>Read our studio policies and much more!</li>
    </ul>
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)
    </p>
    <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #888888;">
      Nearest MRT: Holland Village &middot; No on-site parking
    </p>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to seeing you at the studio!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
      <tr>
        <td align="center">
          <a href="${url}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Sign in
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
