const { wrapEmailTemplate } = require('./base');

/**
 * Generate course unconfirmed email — sent 3 days before start date
 * when threshold (4 students) has not been met
 */
function generateCourseUnconfirmedEmail({ courseType, dayOfWeek, startDate, timeSlot }) {
  const displayType = courseType || 'Wheelthrowing';
  const subject = `VES — Your ${displayType} course has been postponed`;

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Course Update
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear VES Student,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      We regret to inform you that your <strong>${displayType}</strong> course scheduled for <strong>${dayOfWeek}s</strong> starting <strong>${startDate}</strong> (${timeSlot}) has not yet reached the minimum number of students required to proceed.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF8F5; border-left: 3px solid #C4622D; border-radius: 4px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 12px 16px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">What happens next</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">
            Your course will be <strong>postponed by one week</strong> to the same day and time. We will continue to postpone week by week until we have enough students to run the class.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #282828;">
      You do not need to take any action — your enrolment is still secured and we will notify you once the class is confirmed. If you would like to transfer to a different timeslot or have any questions, please don't hesitate to contact us.
    </p>

    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #282828;">
      We appreciate your patience and look forward to seeing you at the studio!<br />
      <strong>Eve</strong><br />
      Ves Studio
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Manage Your Bookings
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateCourseUnconfirmedEmail };
