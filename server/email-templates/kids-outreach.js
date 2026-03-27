const { wrapEmailTemplate } = require('./base');

/**
 * Generate kids course auto-outreach email — sent immediately on purchase
 */
function generateKidsOutreachEmail({ parentName }) {
  const subject = "VES — Let's Play with Clay: Let's Arrange Your Class!";

  const greeting = parentName ? `Dear ${parentName},` : 'Dear Parent,';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Let's Play with Clay!
    </h1>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for purchasing our <strong>Kids Let's Play with Clay</strong> session! We're excited to have your child join us at the studio.
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Please reply to this email to arrange your preferred date and time, and we'll get everything set up for you.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Studio Location</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
          <p style="margin: 0; font-size: 14px; color: #888888;">
            <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">View on Google Maps</a> &middot; Nearest MRT: Holland Village
          </p>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to hearing from you!
    </p>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Best regards,<br/>
      <strong>Eve</strong><br/>
      <span style="color: #888888;">Ves Studio</span>
    </p>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateKidsOutreachEmail };
