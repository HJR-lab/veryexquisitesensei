const { wrapEmailTemplate } = require('../base');

// Known couriers get a real tracking link; anything else still shows the number
// so the student can paste it wherever they need to. Never invent a URL for a
// carrier we don't recognise — a dead link is worse than a bare number.
const TRACKING_URLS = {
  'singpost': 'https://www.singpost.com/track-items?track_number=',
  'ninjavan': 'https://www.ninjavan.co/en-sg/tracking?id=',
  'j&t': 'https://www.jtexpress.sg/index/query/gzquery.html?bills=',
  'qxpress': 'https://www.qxpress.asia/Tracking/Tracking?invoiceNo=',
  'dhl': 'https://www.dhl.com/sg-en/home/tracking.html?tracking-id=',
  'fedex': 'https://www.fedex.com/fedextrack/?trknbr=',
  'grab': null,
  'lalamove': null,
};

function trackingUrl(carrier, number) {
  if (!carrier || !number) return null;
  const base = TRACKING_URLS[carrier.trim().toLowerCase()];
  return base ? base + encodeURIComponent(number.trim()) : null;
}

function generate({ studentName, pieceCount, carrier, trackingNumber, photoUrl, appUrl, feeCharged, feeOutstanding, feeWaived }) {
  const subject = 'Your pottery is on its way 📦';
  const plural = pieceCount !== 1;
  const url = trackingUrl(carrier, trackingNumber);

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${studentName},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Your <strong>${pieceCount} piece${plural ? 's' : ''}</strong> ${plural ? 'have' : 'has'} been
      packed and sent out${carrier ? ` with <strong>${carrier}</strong>` : ''}.
    </p>
    ${photoUrl ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${photoUrl}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    ${trackingNumber ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #C4622D; text-transform: uppercase; letter-spacing: 0.06em;">Tracking number</p>
        <p style="margin: 0; font-size: 18px; font-weight: 600; color: #282828; font-family: monospace; letter-spacing: 0.02em;">${trackingNumber}</p>
      </td></tr>
    </table>
    ` : ''}
    ${url ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${url}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Track My Parcel
          </a>
        </td>
      </tr>
    </table>
    ` : ''}
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333;">
      ${feeWaived > 0
        ? (feeCharged > 0
            ? `We put $${feeCharged.toFixed(2)} of your studio credit towards the $10 delivery, and
               the rest is <strong>on us</strong> — nothing to pay.`
            : `The $10 delivery is <strong>on us</strong> this time — nothing to pay.`)
        : feeOutstanding > 0
          ? (feeCharged > 0
              ? `We put $${feeCharged.toFixed(2)} of your studio credit towards the $10 delivery fee.
                 There's <strong>$${feeOutstanding.toFixed(2)} left to settle</strong> — we'll sort
                 that out with you, no rush.`
              : `The $10 delivery fee is still <strong>outstanding</strong> — we'll sort that out
                 with you, no rush.`)
          : `The $10 delivery fee came out of your studio credit, so there's nothing to pay.`}
    </p>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Pottery travels badly, so we pack carefully — but if anything arrives damaged, reply to this
      email with a photo and we'll make it right.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate, trackingUrl, TRACKING_URLS };
