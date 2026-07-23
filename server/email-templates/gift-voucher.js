const { wrapEmailTemplate } = require('./base');
const { TIER_PERKS } = require('./membership-confirmed');

// Escape untrusted values (giver message, names, labels) before interpolating
// into HTML — this content is free text typed by a purchaser and emailed to a
// third party, so it must never be able to inject markup.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HB_BENEFITS = [
  'A relaxed 2-hour handbuilding session for the whole family',
  'Hands-on making — pinch, coil & slab, no wheel needed',
  'Perfect for little hands and grown-ups alike',
  'All clay, tools and studio materials provided',
  'Your finished pieces are glazed and kiln-fired to keep',
  'Flexible scheduling — come in when it suits your family',
  'Guided by our studio team every step of the way',
];

const WT_BENEFITS = [
  'A multi-week wheelthrowing course with your own wheel each session',
  'Learn centering, throwing, trimming & glazing from scratch',
  'All clay, tools and studio materials provided',
  'Your finished pieces are glazed and kiln-fired to keep',
  'Small classes with hands-on guidance',
  'Suitable for complete beginners',
];

// Membership months → tier label, e.g. 6 → "Silver".
function membershipMonths(months) {
  return TIER_PERKS[months] ? months : 6;
}

// ── Subject registry ─────────────────────────────────────────────────────────
// Each gift subject supplies its own label, intro tagline, description, benefit
// list and redemption copy. Values may be functions of ({ months }) so the
// membership subject can vary by tier. The giver's message card is identical
// across every subject.
const GIFT_SUBJECTS = {
  handbuilding: {
    label: () => 'Family Handbuilding Experience',
    introTail: 'to enjoy together as a family.',
    description:
      'Handbuilding is the most relaxed, hands-on way to make pottery — shaping clay ' +
      'entirely by hand, no wheel required. Your gift is a <strong>2-hour session</strong> ' +
      'the whole family can share: a warm, unhurried afternoon of making together.',
    benefits: () => HB_BENEFITS,
    redeemTitle: 'Redeeming your gift',
    redeemBody:
      'Simply reply to this email with a few dates that work for your family and we\'ll ' +
      'reserve your session. This gift has no expiry — come in whenever you\'re ready.',
    cta: 'Book your session',
  },
  wheelthrowing: {
    label: () => 'Wheelthrowing Course',
    introTail: 'to spark a new creative journey.',
    description:
      'Wheelthrowing is the art of shaping clay on a spinning wheel — centering, pulling ' +
      'walls, and turning a lump of clay into a finished vessel. Over the course you\'ll ' +
      'learn the fundamentals hands-on, at your own pace.',
    benefits: () => WT_BENEFITS,
    redeemTitle: 'Redeeming your gift',
    redeemBody:
      'Reply to this email and we\'ll help you pick an upcoming course date and reserve ' +
      'your spot. This gift has no expiry — start whenever you\'re ready.',
    cta: 'Reserve your spot',
  },
  membership: {
    label: ({ months }) => {
      const m = membershipMonths(months);
      const tier = TIER_PERKS[m].tier;
      return `Clay Club ${m} Month${m !== 1 ? 's' : ''} · ${tier} Membership`;
    },
    introTail: 'so you can make whenever inspiration strikes.',
    description:
      'Ves Clay Club gives you unlimited access to our studio to work on your own pottery ' +
      'within studio hours — your own space to create, at your own pace. The term begins ' +
      'on your first studio visit, so there\'s no rush to start.',
    benefits: ({ months }) => TIER_PERKS[membershipMonths(months)].perks,
    redeemTitle: 'Starting your membership',
    redeemBody:
      'Your membership is reserved for you. The term begins on your first studio visit — ' +
      'just come in and we\'ll get you set up. No rush; it\'s held for you until you\'re ready.',
    cta: 'Plan your first visit',
  },
};

/**
 * Generate a gift-voucher email for the recipient of a gifted experience.
 *
 * Two parts:
 *   1. A personal card with the giver's message to the recipient.
 *   2. A subject-specific description of the gift and what it includes.
 *
 * @param {Object} params
 * @param {string} [params.subject='handbuilding'] - 'handbuilding' | 'wheelthrowing' | 'membership'
 * @param {string} params.recipientName - Who the gift is for (e.g. "Vera")
 * @param {string} params.giverMessage  - The giver's message; newlines preserved
 * @param {string} [params.giverName]   - Who it's from
 * @param {string} [params.giftLabel]   - Overrides the subject's default label
 * @param {string[]} [params.benefits]  - Overrides the subject's default benefits
 * @param {number} [params.months]      - Membership duration (1|6|12) for the membership subject
 * @returns {{ subject: string, html: string }}
 */
function generateGiftVoucherEmail({ subject, recipientName, giverMessage, giverName, giftLabel, benefits, months }) {
  const cfg = GIFT_SUBJECTS[subject] || GIFT_SUBJECTS.handbuilding;
  const ctx = { months };
  const name = (recipientName || '').trim();
  const label = giftLabel || cfg.label(ctx);
  const perks = Array.isArray(benefits) && benefits.length > 0 ? benefits : cfg.benefits(ctx);

  // Subject line is a plain-text header (not HTML) — Resend handles its encoding.
  const emailSubject = name
    ? `${name}, you've received a gift from Ves 🎁`
    : `You've received a gift from Ves 🎁`;

  const fromLine = giverName ? ` from <strong>${esc(giverName)}</strong>` : '';

  // Preserve the giver's line breaks — render each non-empty line as its own
  // paragraph so the note reads like a hand-written card.
  const messageLines = String(giverMessage || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line =>
      `<p style="margin: 0 0 10px; font-size: 15px; line-height: 1.7; color: #4a3b33; font-style: italic; font-family: Georgia, 'Times New Roman', serif;">${esc(line)}</p>`
    )
    .join('');

  const perksHtml = perks.map(p =>
    `<tr><td style="padding: 5px 0; font-size: 14px; line-height: 1.5; color: #282828; vertical-align: top;">
      <span style="color: #C4622D; margin-right: 8px;">&#10003;</span> ${esc(p)}
    </td></tr>`
  ).join('');

  const body = `
    <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #C4622D; text-align: center; text-transform: uppercase; letter-spacing: 0.1em;">
      A Gift For You
    </p>
    <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #282828; text-align: center;">
      ${name ? `Dear ${esc(name)},` : 'Someone special'} 🎁
    </h1>
    <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #282828; text-align: center;">
      You've received a gift${fromLine} — a <strong>${esc(label)}</strong> at Ves,
      ${cfg.introTail}
    </p>

    <!-- Part 1 · The giver's message -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 12px; margin: 0 0 28px;">
      <tr>
        <td style="padding: 24px 26px;">
          <p style="margin: 0 0 14px; font-size: 12px; font-weight: 700; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.08em;">
            &#9829; A message for you
          </p>
          ${messageLines}
        </td>
      </tr>
    </table>

    <!-- Part 2 · The gift itself -->
    <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.08em;">
      Your Gift
    </p>
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 600; color: #282828;">
      ${esc(label)}
    </h2>
    <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #282828;">
      ${cfg.description}
    </p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 26px;">
      ${perksHtml}
    </table>

    <!-- Redeem -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">${cfg.redeemTitle}</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">
            ${cfg.redeemBody}
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 0;">
      <tr>
        <td align="center">
          <a href="mailto:info@ves.sg?subject=Redeeming%20my%20Ves%20gift" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            ${cfg.cta}
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: #282828; text-align: center;">
      We can't wait to welcome you to the studio!
    </p>`;

  return { subject: emailSubject, html: wrapEmailTemplate(body) };
}

module.exports = { generateGiftVoucherEmail, GIFT_SUBJECTS };
