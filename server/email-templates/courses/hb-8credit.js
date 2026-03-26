const { wrapEmailTemplate } = require('../base');

function generate({ specialNotes }) {
  const subject = 'VES Course Details: Handbuilding 8-Credit Package';

  const specialNotesBlock = specialNotes ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>` : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Course Details</h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear VES Student,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for purchasing our <strong>Handbuilding 8-Credit Package</strong>. Please find the details below:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your Package</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>8 class credits</strong> — book sessions at your convenience</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
        <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
          <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
        </p>
      </td></tr>
    </table>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">How It Works</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Your 8 credits can be used to book individual handbuilding sessions. Browse available classes and book at your convenience through <a href="https://club.ves.sg/classes" style="color: #C4622D;">club.ves.sg</a>.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Package Fees Include</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Clay, bisque firing, tools and equipment use, decorating and glazing materials, and glaze firing. Additional pieces will incur extra charges.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Please be punctual. The studio opens for entry 10 mins before class begins. Class will begin and end on time.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Aprons are required and not provided. Alternatively aprons can be purchased for $18.</li>
      <li>Carry bags are not provided. Alternatively tote bags can be purchased for $12.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>To enter, please press the doorbell on the wall and someone will open the door for you.</li>
      <li>Please initial your own work clearly in 3 text/numbers to avoid mix-ups.</li>
      <li>Do clean up after yourself and wipe your work area clean after use.</li>
      <li>If you are unwell, please wear a mask.</li>
      <li>Wear comfortable clothes and closed-toe shoes.</li>
      <li>Eating is not allowed in the studio.</li>
      <li>If you are under 16, please notify us in advance.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Studio Policy</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Classes are non-refundable. We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.
      For full studio policies, visit <a href="https://club.ves.sg/policies" style="color: #C4622D;">club.ves.sg/policies</a>.
    </p>

    ${specialNotesBlock}

    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Please do not hesitate to contact us if you have any questions. We look forward to seeing you in class!
    </p>
    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Best regards,<br/><strong>Eve</strong><br/><span style="color: #888888;">VES Clay Studio</span>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
      <tr><td align="center">
        <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Book Your Classes</a>
      </td></tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
