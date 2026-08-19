const { wrapEmailTemplate } = require('../base');

// holdDays mirrors supabaseDb.PIECE_HOLD_DAYS; the thresholds below are the
// reminder milestones (30 / 60 / 83 days), so each send gets its own headline.
function generate({ studentName, courseName, pieceCount, photoUrl, appUrl, daysSinceReady, holdExpiresDate, holdDays = 90 }) {
  const daysLeft = Math.max(0, holdDays - daysSinceReady);
  const isUrgent = daysLeft <= 14;
  const isFinal = daysLeft <= 7;

  let headline;
  if (isFinal) {
    headline = 'Last chance — your pottery will be recycled in ' + daysLeft + ' days';
  } else if (isUrgent) {
    headline = 'Your pottery will be recycled in ' + daysLeft + ' days';
  } else if (daysSinceReady >= 60) {
    headline = "Don't forget your pottery!";
  } else if (daysSinceReady >= 30) {
    headline = 'Your pottery is still here';
  } else {
    headline = 'Just a reminder — your pieces are waiting!';
  }

  const subject = isUrgent ? `⚠️ ${headline}` : `🏺 ${headline}`;

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: ${isUrgent ? '#D32F2F' : '#282828'}; font-weight: 600;">
      ${headline}
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Hi ${studentName}, your <strong>${pieceCount} piece${pieceCount !== 1 ? 's' : ''}</strong> from
      <strong>${courseName}</strong> ${pieceCount !== 1 ? 'are' : 'is'} ready for collection.
    </p>
    ${photoUrl ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${photoUrl}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    ${isUrgent ? `
    <div style="margin: 0 0 20px; padding: 16px; background: #FFF3E0; border-radius: 8px; border-left: 4px solid #E65100;">
      <p style="margin: 0; font-size: 14px; color: #E65100; font-weight: 600;">
        ⚠️ Your pieces will be recycled after ${holdExpiresDate}. Please collect or arrange delivery before then.
      </p>
    </div>
    ` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td width="48%" align="center" style="padding-right: 8px;">
          <a href="${appUrl}/gallery?tab=pieces" style="display: block; padding: 14px 20px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I'll Collect
          </a>
        </td>
        <td width="48%" align="center" style="padding-left: 8px;">
          <a href="${appUrl}/gallery?tab=pieces" style="display: block; padding: 14px 20px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Deliver ($10)
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      We hold pieces for 3 months from the ready date.
      <br /><br />
      Can't get to the studio? Choose Deliver above and we'll arrange local delivery to you.
      <br /><br />
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
