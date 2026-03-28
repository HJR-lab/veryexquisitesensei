const { wrapEmailTemplate } = require('../base');

/**
 * Generate course detail email for Handbuilding 8-Credit Package
 */
function generate({ specialNotes }) {
  const subject = 'VES Course Details: Handbuilding 8-Credit Package';

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
      Handbuilding 8-Credit Package
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888; text-align: center;">Course Details &amp; Studio Information</p>

    ${specialNotesBlock}

    <!-- Package Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your Package</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>8 class credits</strong> — book sessions at your convenience</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">Browse available classes and book through <a href="https://club.ves.sg/classes" style="color: #C4622D;">club.ves.sg</a></p>
        </td>
      </tr>
    </table>

    <!-- About the Course -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">About the Course</p>
    <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #282828;">
      This handbuilding package gives you 8 class credits to attend sessions at your own pace. Each session covers various hand-forming techniques including pinching, coiling, and slab building. You will create your own unique ceramic pieces, which will be bisque fired, glazed, and glaze fired.
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

    <!-- Items Required -->
    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</p>
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.7; color: #282828;">The following items are required and available for purchase at the studio:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #282828;">Apron</td>
        <td style="padding: 4px 0; font-size: 14px; color: #282828; text-align: right;">$45</td>
      </tr>
    </table>

    <!-- Policies link -->
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #282828;">
      For studio rules and other information, visit <a href="https://club.ves.sg/policies" style="color: #C4622D;">club.ves.sg/policies</a>
    </p>

    <!-- Address -->
    <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)
    </p>
    <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #888888;">
      Nearest MRT: Holland Village &middot; No on-site parking
    </p>

    <!-- Clay Club -->
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
      As a Ves &middot; Clay Club Student, you can:
    </p>
    <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Manage all course bookings</li>
      <li>Book additional unguided studio sessions</li>
      <li>Keep a gallery of your completed works</li>
      <li>Read our studio policies and much more!</li>
    </ul>

    <!-- Sign-off -->
    <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to seeing you at the studio!
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Sign in
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
