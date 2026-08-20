const { wrapEmailTemplate, esc, escUrl } = require('../base');

function generate({ studentName, courseName, pieceCount, photoUrl, appUrl }) {
  // Everything below that came from outside this file is escaped: a student
  // sets their own name in Shopify and it reaches us through sync. See esc()
  // in ../base for why an unescaped name is more than a broken email.
  const count = Number(pieceCount) || 0;
  const safePhoto = escUrl(photoUrl);
  const safeApp = escUrl(appUrl);

  const subject = 'Your pottery is ready! 🏺';

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${esc(studentName)},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Great news! Your <strong>${count} piece${count !== 1 ? 's' : ''}</strong> from
      <strong>${esc(courseName)}</strong> have been fired and are ready.
    </p>
    ${safePhoto ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${safePhoto}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333;">
      How would you like to get them?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td width="48%" align="center" style="padding-right: 8px;">
          <a href="${safeApp}/gallery?intent=collect" style="display: block; padding: 14px 20px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I'll Collect
          </a>
        </td>
        <td width="48%" align="center" style="padding-left: 8px;">
          <a href="${safeApp}/gallery?intent=deliver" style="display: block; padding: 14px 20px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Deliver ($10)
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      We'll hold your pieces for 3 months, and we'll remind you along the way. After that we have to
      recycle whatever is left to make space for the next class.
      <br /><br />
      Can't get to the studio? Choose Deliver above and we'll arrange local delivery to you.
      <br /><br />
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
