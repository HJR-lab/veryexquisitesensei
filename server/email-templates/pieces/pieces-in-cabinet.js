const { wrapEmailTemplate } = require('../base');

function generate({ studentName, pieceCount, photoUrl, appUrl }) {
  const subject = 'Your pieces are in the cabinet — come collect!';

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${studentName},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Your <strong>${pieceCount} piece${pieceCount !== 1 ? 's' : ''}</strong>
      ${pieceCount !== 1 ? 'are' : 'is'} now in the glass cabinet outside the studio — come pick
      ${pieceCount !== 1 ? 'them' : 'it'} up anytime!
    </p>
    ${photoUrl ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${photoUrl}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333;">
      Once you've collected ${pieceCount !== 1 ? 'them' : 'it'}, just tap the button below to let us know.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${appUrl}/gallery?tab=pieces" style="display: inline-block; padding: 14px 32px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I've Collected My Pieces
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
