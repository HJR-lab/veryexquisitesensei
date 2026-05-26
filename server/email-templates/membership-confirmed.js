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

const DEFAULT_STUDIO_HOURS = [
  { day: 'Monday',    hours: '11:00 am – 9:00 pm' },
  { day: 'Tuesday',   hours: '11:00 am – 6:00 pm' },
  { day: 'Wednesday', hours: '11:00 am – 6:00 pm' },
  { day: 'Thursday',  hours: '11:00 am – 6:00 pm' },
  { day: 'Friday',    hours: '11:00 am – 9:00 pm' },
  { day: 'Saturday',  hours: '4:00 pm – 8:00 pm' },
  { day: 'Sunday',    hours: '12:00 pm – 6:00 pm' },
];

/**
 * Generate membership confirmation email
 * @param {Object} params
 * @param {string} params.firstName - Member's first name
 * @param {number} params.months - Membership duration (1, 6, or 12)
 * @param {string} params.startDate - e.g. "27 March 2026"
 * @param {string} params.endDate - e.g. "27 April 2026"
 * @param {string} [params.accessCode] - Studio entry keypad code (e.g. "050590#")
 * @param {Array<{day:string,hours:string}>} [params.studioHours] - Per-day access hours
 * @returns {{ subject: string, html: string }}
 */
function generateMembershipConfirmedEmail({ firstName, months, startDate, endDate, accessCode, studioHours }) {
  const tierInfo = TIER_PERKS[months] || TIER_PERKS[1];
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Member,';
  const durationLabel = `${months} Month${months !== 1 ? 's' : ''}`;
  const subject = `VES — Welcome to Ves Clay Club (${durationLabel} ${tierInfo.tier} Membership)`;
  const code = accessCode || '050590#';
  const hours = Array.isArray(studioHours) && studioHours.length > 0 ? studioHours : DEFAULT_STUDIO_HOURS;

  const perksHtml = tierInfo.perks.map(p =>
    `<tr><td style="padding: 4px 0 4px 0; font-size: 14px; color: #282828; vertical-align: top;">
      <span style="color: #C4622D; margin-right: 8px;">&#10003;</span> ${p}
    </td></tr>`
  ).join('');

  const hoursHtml = hours.map(({ day, hours: hrs }) =>
    `<tr>
      <td style="padding: 3px 0; font-size: 14px; color: #282828; width: 110px;">${day}</td>
      <td style="padding: 3px 0; font-size: 14px; color: #282828;">${hrs}</td>
    </tr>`
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
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      ${perksHtml}
    </table>

    <!-- Entry code -->
    <p style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: #282828;">Entry</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td align="center" style="padding: 14px 16px;">
          <div style="font-size: 11px; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">Studio Keypad Code</div>
          <div style="font-size: 22px; font-weight: 700; color: #282828; letter-spacing: 0.08em; font-family: 'SFMono-Regular', Menlo, Consolas, monospace;">${code}</div>
        </td>
      </tr>
    </table>

    <!-- Studio hours -->
    <p style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: #282828;">Studio Access</p>
    <p style="margin: 0 0 8px; font-size: 13px; color: #888888;">Strictly for Ves Clay Club Members only.</p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      ${hoursHtml}
    </table>

    <!-- WhatsApp group -->
    <p style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: #282828;">WhatsApp Group</p>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #282828;">
      You'll be added to our members-only WhatsApp group — we'll send the invite to the mobile number on your account shortly.
    </p>

    <!-- Orientation -->
    <p style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: #282828;">Orientation</p>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #282828;">
      Let us know when you intend to start. Our studio manager will attend to you on your first visit
      for an initial orientation — pails, clay, tools, reclaim buckets, towels, power supply, glazes,
      firing charges, studio cleanliness and discipline.
    </p>

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
