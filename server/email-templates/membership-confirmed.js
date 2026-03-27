const { wrapEmailTemplate } = require('./base');

const TIER_PERKS = {
  1: {
    tier: 'Bronze',
    perks: [
      'Unlimited studio access',
      'Free dedicated storage',
      'Free shelving space',
      'All studio glazes included',
    ],
  },
  6: {
    tier: 'Silver',
    perks: [
      'Unlimited studio access',
      'Free dedicated storage',
      'Free shelving space',
      'All studio glazes included',
      'Studio-assisted clay reclaim',
      'FREE 1x Firing (worth $90)',
      '10% off clay, tools, firing & courses',
    ],
  },
  12: {
    tier: 'Gold',
    perks: [
      'Unlimited studio access',
      'Free dedicated storage',
      'Free shelving space',
      'All studio glazes included',
      'Studio-assisted clay reclaim',
      'FREE 2x $130 Firing Basket (worth $260)',
      '10% off clay, tools, firing & courses',
    ],
  },
};

/**
 * Generate membership confirmation email
 * @param {Object} params
 * @param {string} params.firstName - Member's first name
 * @param {number} params.months - Membership duration (1, 6, or 12)
 * @param {string} params.startDate - e.g. "27 March 2026"
 * @param {string} params.endDate - e.g. "27 April 2026"
 * @returns {{ subject: string, html: string }}
 */
function generateMembershipConfirmedEmail({ firstName, months, startDate, endDate }) {
  const tierInfo = TIER_PERKS[months] || TIER_PERKS[1];
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Member,';
  const durationLabel = `${months} Month${months !== 1 ? 's' : ''}`;
  const subject = `VES — Welcome to Ves Clay Club (${durationLabel} ${tierInfo.tier} Membership)`;

  const perksHtml = tierInfo.perks.map(p =>
    `<tr><td style="padding: 4px 0 4px 0; font-size: 14px; color: #282828; vertical-align: top;">
      <span style="color: #C4622D; margin-right: 8px;">&#10003;</span> ${p}
    </td></tr>`
  ).join('');

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Welcome to Ves &middot; Clay Club!
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for joining Ves Clay Club! Your <strong>${durationLabel} ${tierInfo.tier} Membership</strong> is now active.
    </p>

    <!-- Membership Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">
                ${tierInfo.tier} Member
              </td>
              <td align="right" style="font-size: 13px; font-weight: 600; color: #9E4A1E;">
                ${durationLabel}
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
            <tr>
              <td width="50%">
                <div style="font-size: 11px; color: #888888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Start</div>
                <div style="font-size: 14px; font-weight: 600; color: #282828;">${startDate}</div>
              </td>
              <td width="50%">
                <div style="font-size: 11px; color: #888888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">End</div>
                <div style="font-size: 14px; font-weight: 600; color: #282828;">${endDate}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Perks -->
    <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #282828;">Your membership includes:</p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      ${perksHtml}
    </table>

    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)
    </p>

    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
      As a Ves &middot; Clay Club Member, you can:
    </p>
    <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Book studio access sessions</li>
      <li>Manage all course bookings</li>
      <li>Keep a gallery of your completed works</li>
      <li>Read our studio policies and much more!</li>
    </ul>

    <p style="margin: 0 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Welcome aboard — we look forward to seeing you at the studio!
    </p>
    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Best regards,<br/><strong>Eve</strong><br/><span style="color: #888888;">Ves Studio</span>
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
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

module.exports = { generateMembershipConfirmedEmail };
