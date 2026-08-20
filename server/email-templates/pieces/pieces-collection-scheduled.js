const { wrapEmailTemplate } = require('../base');

// Acknowledgement sent the moment a student picks a collection date. It is
// deliberately NOT the confirmation: the studio still has to find the batch and
// stage it, and that step sends pieces-in-cabinet. Saying "confirmed" here would
// promise something nobody has checked yet, so this one only says "received".
function generate({ studentName, pieceCount, collectionDate, appUrl }) {
  const subject = 'We got your collection date';

  const plural = pieceCount !== 1;
  const pretty = new Date(collectionDate).toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore',
  });

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${studentName},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      We've got you down for <strong>${pretty}</strong> to collect your
      <strong>${pieceCount} piece${plural ? 's' : ''}</strong>.
    </p>
    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333;">
      Next we'll find ${plural ? 'them' : 'it'} in the studio and set ${plural ? 'them' : 'it'} aside
      for you. You'll get one more email from us confirming ${plural ? 'they are' : 'it is'} out
      and ready — please wait for that before making the trip.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${appUrl}/gallery" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            View My Pieces
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Need a different date? Reply to this email and we'll sort it out.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
