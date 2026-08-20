const { wrapEmailTemplate } = require('../base');

// Two clocks, two sets of copy. A batch still on the shelf runs the 90-day hold
// with milestones at 30/60/83; a batch already staged in the cabinet runs a
// 30-day one with milestones at 14/21. clockKind decides which story to tell —
// somebody whose pieces are sitting in the cabinet must not be told they are
// "ready for collection" and offered a Collect/Deliver choice they already made.
// The 14/7-days-left urgency thresholds suit both: on the cabinet clock day 14
// still reads as a nudge and day 21 lands as a warning.
function generate({ studentName, courseName, pieceCount, photoUrl, appUrl, daysSinceReady, holdExpiresDate, holdDays = 90, clockKind = 'ready' }) {
  const daysLeft = Math.max(0, holdDays - daysSinceReady);
  const isUrgent = daysLeft <= 14;
  const isFinal = daysLeft <= 7;
  const inCabinet = clockKind === 'cabinet';
  const plural = pieceCount !== 1;

  let headline;
  if (isFinal) {
    headline = 'Last chance — your pottery will be recycled in ' + daysLeft + ' days';
  } else if (isUrgent) {
    headline = 'Your pottery will be recycled in ' + daysLeft + ' days';
  } else if (inCabinet) {
    headline = 'Your pottery is waiting in the cabinet';
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
      ${inCabinet
        ? `Hi ${studentName}, your <strong>${pieceCount} piece${plural ? 's' : ''}</strong> from
           <strong>${courseName}</strong> ${plural ? 'are' : 'is'} already out in the glass cabinet
           outside the studio — just waiting for you to swing by.`
        : `Hi ${studentName}, your <strong>${pieceCount} piece${plural ? 's' : ''}</strong> from
           <strong>${courseName}</strong> ${plural ? 'are' : 'is'} ready for collection.`}
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
    ${inCabinet ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${appUrl}/gallery" style="display: inline-block; padding: 14px 32px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I've Collected My Pieces
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Pieces stay in the cabinet for ${holdDays} days once we've set them out — after that we have
      to clear the space for the next class.
      <br /><br />
      Can't make it in? Reply to this email and we'll arrange local delivery instead.
    </p>` : `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td width="48%" align="center" style="padding-right: 8px;">
          <a href="${appUrl}/gallery?intent=collect" style="display: block; padding: 14px 20px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I'll Collect
          </a>
        </td>
        <td width="48%" align="center" style="padding-left: 8px;">
          <a href="${appUrl}/gallery?intent=deliver" style="display: block; padding: 14px 20px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
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
    </p>`}
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
