const { wrapEmailTemplate } = require('./base');

/**
 * Email sent to a current single-course student when the next course in their
 * slot is listed: their seat is held, and the link lets them pay to keep it.
 *
 * Like the package offer, it says nothing about how full the cohort is.
 */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function formatDate(d) {
  if (!d) return '';
  const date = new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`);
  return date.toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore',
  });
}

function formatDeadline(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore',
  });
}

function formatPrice(price) {
  const n = Number(price);
  return Number.isFinite(n) && n > 0 ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '';
}

/**
 * @param {object} p
 * @param {string} p.firstName
 * @param {string} p.courseTitle    Shopify product title
 * @param {string} p.startDate      first class, YYYY-MM-DD
 * @param {string} p.classTime
 * @param {number} p.numberOfWeeks
 * @param {number} p.price
 * @param {string} p.deadlineIso    when the hold lapses
 * @param {string} p.offerUrl       /continue/:token
 */
function generate({ firstName, courseTitle, startDate, classTime, numberOfWeeks, price, deadlineIso, offerUrl }) {
  const subject = `Your next course starts ${formatDate(startDate).replace(/^\w+, /, '')} — we have kept your place`;
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const priceText = formatPrice(price);

  const body = `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      The next course in your usual slot is now open, and before it goes to everyone
      else we have kept a place for you:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px; background-color: #F9EDE6; border-radius: 8px;">
      <tr>
        <td style="padding: 18px 20px;">
          ${courseTitle ? `<div style="font-size: 13px; color: #9E4A1E; margin-bottom: 4px;">${esc(courseTitle)}</div>` : ''}
          <div style="font-size: 16px; font-weight: 700; color: #282828;">${formatDate(startDate)}</div>
          <div style="font-size: 14px; color: #9E4A1E; margin-top: 4px;">${esc(classTime || '')} &middot; ${esc(numberOfWeeks || 6)} weeks${priceText ? ` &middot; ${priceText}` : ''}</div>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Your place is held until <strong>${formatDeadline(deadlineIso)}</strong>. After that
      we release it to the next person.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${offerUrl}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Keep my place
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.7; color: #888888;">
      Not the right time? The same link lets you pass on this one or ask for a few
      more days to decide.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
