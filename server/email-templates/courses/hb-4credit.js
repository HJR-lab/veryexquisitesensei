const { wrapEmailTemplate } = require('../base');

/**
 * Generate course detail email for Handbuilding 4-Credit Package
 */
function generate({ specialNotes }) {
  const subject = 'VES Course Details: Handbuilding 4-Credit Package';

  const specialNotesBlock = specialNotes
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF8F5; border-left: 3px solid #C4622D; border-radius: 4px; margin: 0 0 20px;">
        <tr>
          <td style="padding: 12px 16px;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Note</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">${specialNotes}</p>
          </td>
        </tr>
      </table>`
    : '';

  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Handbuilding 4-Credit Package
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888; text-align: center;">Course Details &amp; Studio Information</p>

    ${specialNotesBlock}

    <!-- Package Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your Package</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>4 class credits</strong> — book sessions at your convenience</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">Browse available classes and book through <a href="https://club.ves.sg/classes" style="color: #C4622D;">club.ves.sg</a></p>
        </td>
      </tr>
    </table>

    <!-- About the Course -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">About the Course</p>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #282828;">
      This handbuilding package gives you 4 class credits to attend sessions at your own pace. Each session covers various hand-forming techniques including pinching, coiling, and slab building. You will create your own unique ceramic pieces, which will be bisque fired, glazed, and glaze fired.
    </p>

    <!-- Fees Include -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Fees Include</p>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #282828;">
      Clay, bisque firing, tools and equipment use, decorating and glazing materials, and glaze firing. Additional pieces will incur extra charges.
    </p>

    <!-- How to Book -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">How to Book</p>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #282828;">
      Visit <a href="https://club.ves.sg/classes" style="color: #C4622D;">club.ves.sg</a> to browse available handbuilding sessions and book at your convenience. Each booking uses one class credit.
    </p>

    <!-- Class Size & Policy -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Class Size &amp; Policy</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr>
        <td style="padding: 0 0 8px;">
          <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #282828;">
            Course fees are <strong>non-refundable</strong>. Credits do not expire but are non-transferable.
          </p>
        </td>
      </tr>
    </table>

    <!-- Punctuality -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</p>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #282828;">
      The studio opens for entry <strong>10 minutes before class begins</strong>. Please arrive on time as latecomers may miss important instructions.
    </p>

    <!-- What to Bring / Purchase -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</p>
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.7; color: #282828;">The following items are available for purchase at the studio:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #282828;">Apron (required, not provided)</td>
        <td style="padding: 4px 0; font-size: 14px; color: #282828; text-align: right;">$18</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #282828;">Tote bag</td>
        <td style="padding: 4px 0; font-size: 14px; color: #282828; text-align: right;">$12</td>
      </tr>
    </table>

    <!-- Additional Information -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• Ring the doorbell upon arrival if the door is not open.</td></tr>
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• Please initial your work using 3 characters (e.g. your initials) for identification.</td></tr>
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• All students are responsible for cleaning up their workspace after each session.</td></tr>
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• Please wear a mask if you are feeling unwell.</td></tr>
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• Wear comfortable clothes and closed-toe shoes. Clay stains — please dress accordingly.</td></tr>
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• No eating or drinking (other than water) in the studio.</td></tr>
      <tr><td style="padding: 3px 0; font-size: 14px; line-height: 1.6; color: #282828;">• Students under 16 must notify us in advance.</td></tr>
    </table>

    <!-- Studio Policy -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Studio Policy</p>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #282828;">
      VES reserves the right to refuse entry to students who do not adhere to studio rules.
      Full studio policies: <a href="https://club.ves.sg/policies" style="color: #C4622D;">club.ves.sg/policies</a>
    </p>

    <!-- Address -->
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Studio Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens, Singapore 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a>)
    </p>

    <!-- Sign-off -->
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #282828;">
      Looking forward to seeing you in class!<br />
      <strong>Eve</strong><br />
      Ves Studio
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Book Your Classes
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
