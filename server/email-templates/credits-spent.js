const { wrapEmailTemplate } = require('./base');

/**
 * Generate credits-spent email — sent when VES Credits are applied to a purchase
 * @param {Object} params
 * @param {string} params.firstName - Student's first name
 * @param {number} params.amountSpent - Credits applied (e.g. 20)
 * @param {string} params.appliedTo - What the credit was applied to (e.g. "Reschedule fee")
 * @param {number} params.remainingBalance - Updated credit balance after deduction
 * @returns {{ subject: string, html: string }}
 */
function generate({ firstName, amountSpent, appliedTo, remainingBalance }) {
  const subject = 'VES Credit Applied';
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Student,';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      VES Credit Applied
    </h1>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      VES Credits have been applied to your account. Here's a summary of the transaction.
    </p>

    <!-- Credits Applied Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; border-radius: 8px; margin: 0 0 16px;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #888888; text-transform: uppercase; letter-spacing: 0.06em;">Credit Applied</p>
          <p style="margin: 0 0 6px; font-size: 36px; font-weight: 700; color: #282828; line-height: 1;">-$${amountSpent}</p>
          <p style="margin: 0; font-size: 13px; color: #888888;">${appliedTo}</p>
        </td>
      </tr>
    </table>

    <!-- Remaining Balance Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(40,40,40,0.09); border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin: 0 0 2px; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 0.05em;">Remaining Balance</p>
                <p style="margin: 0; font-size: 20px; font-weight: 700; color: #282828;">$${remainingBalance}</p>
              </td>
              <td align="right">
                <p style="margin: 0; font-size: 12px; color: #888888;">Expires 31 Dec 2026</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
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
