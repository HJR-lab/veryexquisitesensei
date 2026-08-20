const { wrapEmailTemplate, esc, escUrl } = require('../base');

function generate({ studentName, pieceCount, courseName, appUrl }) {
  // Everything below that came from outside this file is escaped: a student
  // sets their own name in Shopify and it reaches us through sync. See esc()
  // in ../base for why an unescaped name is more than a broken email.
  const count = Number(pieceCount) || 0;
  const safeApp = escUrl(appUrl);

  const subject = 'A note about your pottery pieces';

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${esc(studentName)},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      We've been keeping your <strong>${count} piece${count !== 1 ? 's' : ''}</strong> from
      <strong>${esc(courseName)}</strong> safe for 3 months since they were ready.
    </p>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      As we need to make space in the studio for new work, we've unfortunately had to let them go.
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333;">
      We hope you enjoyed making them — and we'd love to see you back at the wheel soon!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${safeApp}/courses" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Browse Upcoming Courses
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
