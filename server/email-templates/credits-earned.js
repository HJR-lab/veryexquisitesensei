const { wrapEmailTemplate } = require('./base');

/**
 * Generate credits-earned email — sent when a student earns VES Credits from a course
 * @param {Object} params
 * @param {string} params.firstName - Student's first name
 * @param {number} params.amountEarned - Credits earned (e.g. 20)
 * @param {string} params.courseName - Course that triggered the credit (e.g. "6-Week Wheelthrowing")
 * @param {number} params.newBalance - Updated credit balance
 * @returns {{ subject: string, html: string }}
 */
function generate({ firstName, amountEarned, courseName, newBalance }) {
  const subject = "You've earned VES Credits!";
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Student,';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      You've Earned VES Credits!
    </h1>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Great news — you've earned VES Credits for completing a course. Credits can be used toward studio fees, firing, and more.
    </p>

    <!-- Credits Earned Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 16px;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.06em;">Credits Earned</p>
          <p style="margin: 0 0 6px; font-size: 36px; font-weight: 700; color: #C4622D; line-height: 1;">+$${amountEarned}</p>
          <p style="margin: 0; font-size: 13px; color: #9E4A1E;">${courseName}</p>
        </td>
      </tr>
    </table>

    <!-- Balance Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(40,40,40,0.09); border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin: 0 0 2px; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 0.05em;">Your Balance</p>
                <p style="margin: 0; font-size: 20px; font-weight: 700; color: #282828;">$${newBalance}</p>
              </td>
              <td align="right">
                <p style="margin: 0; font-size: 12px; color: #888888;">Expires 31 Dec 2026</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- What You Can Use Credits For -->
    <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #282828;">Use your credits for:</p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td style="padding: 4px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Studio access sessions</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Extra firing fees</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Local delivery (self or as a gift)</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Reschedule fees</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px; color: #282828; vertical-align: top;"><span style="color: #C4622D; margin-right: 8px;">&#10003;</span> Course discount (on request)</td></tr>
    </table>

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
