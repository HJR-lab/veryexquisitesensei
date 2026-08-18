const { wrapEmailTemplate } = require('./base');

/**
 * Email sent to a multi-course package student when their next course is ready
 * to be confirmed.
 *
 * Replaces the manual "do you want to continue?" email and the admin waiting
 * for a reply: the student answers on a tokenised page and the enrollment
 * happens by itself.
 *
 * Deliberately does NOT mention seat counts or how full the cohort is —
 * capacity is admin-facing. Their place is already held; the only question
 * being asked is whether they want it.
 */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function formatDate(d) {
  if (!d) return '';
  const date = new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`);
  return date.toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore',
  });
}

function formatDeadline(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore',
  });
}

/**
 * @param {object} p
 * @param {string} p.firstName
 * @param {string} p.startDate      cohort start, YYYY-MM-DD
 * @param {string} p.classTime      e.g. '1:00 PM - 3:30 PM'
 * @param {string} p.schedulePattern e.g. 'SATURDAY'
 * @param {number} p.courseNumber   which course of the package this would be
 * @param {number} p.totalCourses
 * @param {string} p.deadlineIso    when the offer lapses
 * @param {string} p.offerUrl       /continue/:token
 */
function generate({ firstName, startDate, classTime, schedulePattern, courseNumber, totalCourses, deadlineIso, offerUrl }) {
  const subject = `Your next course starts ${formatDate(startDate).replace(/^\w+, /, '')} — confirm your place`;
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const day = schedulePattern ? esc(schedulePattern.charAt(0) + schedulePattern.slice(1).toLowerCase()) : '';
  const courseLine = (courseNumber && totalCourses)
    ? `This would be course ${courseNumber} of your ${totalCourses}.`
    : '';

  const body = `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Your next wheelthrowing course is ready. ${courseLine} We have kept your usual
      ${day} slot for you:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px; background-color: #F9EDE6; border-radius: 8px;">
      <tr>
        <td style="padding: 18px 20px;">
          <div style="font-size: 16px; font-weight: 700; color: #282828;">${formatDate(startDate)}</div>
          <div style="font-size: 14px; color: #9E4A1E; margin-top: 4px;">${esc(classTime || '')} &middot; 6 weeks</div>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Let us know by <strong>${formatDeadline(deadlineIso)}</strong>. After that we will
      release the place to the next person on the list.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${offerUrl}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Confirm your place
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.7; color: #888888;">
      Not the right time? The same link lets you pass on this one or ask for a few
      more days to decide — your remaining courses do not expire.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
