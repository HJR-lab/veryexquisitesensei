const { wrapEmailTemplate } = require('./base');

/**
 * Generate credits-retroactive email — sent when a student receives retroactive credits for past courses
 * @param {Object} params
 * @param {string} params.firstName - Student's first name
 * @param {number} params.totalCredits - Total credits granted (e.g. 60)
 * @param {number} params.courseCount - Number of past courses counted (e.g. 3)
 * @param {number} params.balance - Current credit balance (same as totalCredits for a fresh grant)
 * @returns {{ subject: string, html: string }}
 */
function generate({ firstName, totalCredits, courseCount, balance }) {
  const subject = 'You have VES Credits waiting!';
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Student,';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      You Have VES Credits Waiting!
    </h1>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      We've introduced VES Credits — a loyalty reward for students who've completed courses with us. Based on your course history, we've added credits to your account retroactively.
    </p>

    <!-- Credits Grant Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 16px;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.06em;">Credits Added to Your Account</p>
          <p style="margin: 0 0 8px; font-size: 42px; font-weight: 700; color: #C4622D; line-height: 1;">$${balance}</p>
          <p style="margin: 0; font-size: 13px; color: #9E4A1E;">${courseCount} past course${courseCount !== 1 ? 's' : ''} &times; $20 = $${totalCredits}</p>
        </td>
      </tr>
    </table>

    <!-- How Credits Work -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(40,40,40,0.09); border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #282828;">How VES Credits Work</p>
          <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
            Earn <strong>$20 in credits</strong> for every course you complete. Credits can be used toward:
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="padding: 3px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Studio access sessions</td></tr>
            <tr><td style="padding: 3px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Extra firing fees</td></tr>
            <tr><td style="padding: 3px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Local delivery (self or as a gift)</td></tr>
            <tr><td style="padding: 3px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Reschedule fees</td></tr>
            <tr><td style="padding: 3px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Course discount (on request)</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.6; color: #888888; text-align: center;">
      Your credits expire on <strong>31 Dec 2026</strong>. Sign in to view your balance and redeem them.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 0;">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/credits" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            View My Credits
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
