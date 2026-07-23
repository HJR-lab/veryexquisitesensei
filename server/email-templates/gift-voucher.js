const { wrapEmailTemplate } = require('./base');

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

const DEFAULT_BENEFITS = [
  'A relaxed 2-hour handbuilding session for the whole family',
  'Hands-on making — pinch, coil & slab, no wheel needed',
  'Perfect for little hands and grown-ups alike',
  'All clay, tools and studio materials provided',
  'Your finished pieces are glazed and kiln-fired to keep',
  'Flexible scheduling — come in when it suits your family',
  'Guided by our studio team every step of the way',
];

/**
 * Generate a gift-voucher email for the recipient of a gifted experience.
 *
 * Two parts:
 *   1. A personal card with the giver's message to the recipient.
 *   2. A description of the gifted experience and what it includes.
 *
 * @param {Object} params
 * @param {string} params.recipientName - Who the gift is for (e.g. "Vera")
 * @param {string} params.giverMessage  - The giver's message; newlines preserved
 * @param {string} [params.giverName]   - Who it's from (falls back to message signature)
 * @param {string} [params.giftLabel]   - e.g. "Family Handbuilding Experience"
 * @param {string[]} [params.benefits]  - Bullet list of what's included
 * @returns {{ subject: string, html: string }}
 */
function generateGiftVoucherEmail({ recipientName, giverMessage, giverName, giftLabel, benefits }) {
  const name = (recipientName || '').trim();
  const label = giftLabel || 'Family Handbuilding Experience';
  const perks = Array.isArray(benefits) && benefits.length > 0 ? benefits : DEFAULT_BENEFITS;
  // Subject is a plain-text header (not HTML) — Resend handles its encoding.
  const subject = name
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
      to enjoy together as a family.
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
      Handbuilding is the most relaxed, hands-on way to make pottery — shaping clay entirely
      by hand, no wheel required. Your gift is a <strong>2-hour session</strong> the whole
      family can share: a warm, unhurried afternoon of making together.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 26px;">
      ${perksHtml}
    </table>

    <!-- Redeem CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Redeeming your gift</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">
            Simply reply to this email with a few dates that work for your family and we'll
            reserve your session. This gift has no expiry — come in whenever you're ready.
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 0;">
      <tr>
        <td align="center">
          <a href="mailto:info@ves.sg?subject=Redeeming%20my%20Ves%20gift" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Book your session
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: #282828; text-align: center;">
      We can't wait to welcome you to the studio!
    </p>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateGiftVoucherEmail, DEFAULT_BENEFITS };
