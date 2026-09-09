const { wrapEmailTemplate } = require('./base');

/**
 * Course postponed email — sent 3 days before the start date when the cohort
 * has not reached its minimum, at the same time the classes are actually moved.
 *
 * The earlier version of this template told students their course "has not yet
 * reached the minimum" and would be "postponed by one week" — in the future
 * tense, because nothing had moved yet and a human still had to do it. It now
 * names the date the classes have already been shifted to, so the student can
 * check it against their own dashboard and find it agrees.
 */
function generateCourseUnconfirmedEmail({ courseType, dayOfWeek, startDate, newStartDate, timeSlot }) {
  const displayType = courseType || 'Wheelthrowing';
  const subject = `VES — Your ${displayType} course has been postponed to ${newStartDate}`;

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Course Update
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear Ves Student,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      We regret to inform you that your <strong>${displayType}</strong> course scheduled for <strong>${dayOfWeek}s</strong> starting <strong>${startDate}</strong> (${timeSlot}) has not reached the minimum of 4 students required to proceed.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF8F5; border-left: 3px solid #C4622D; border-radius: 4px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 12px 16px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your new start date</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">
            <strong>${dayOfWeek}, ${newStartDate}</strong> — same day and time (${timeSlot}).
          </p>
          <p style="margin: 8px 0 0; font-size: 14px; line-height: 1.6; color: #282828;">
            Your whole course has already been moved back by one week, and every class in it now shows the new date in your dashboard. If we still don't have enough students by then, we'll move it on another week and let you know.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #282828;">
      You do not need to take any action — your enrolment is secured and your credits are untouched. If you would like to transfer to a different timeslot, or this new date no longer works for you, just reply to this email and we'll sort it out.
    </p>

    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #282828;">
      We appreciate your patience and look forward to seeing you at the studio!<br />
      <br />
      Ves Studio
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            View Your New Dates
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateCourseUnconfirmedEmail };
