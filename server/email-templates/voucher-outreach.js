const { wrapEmailTemplate } = require('./base');

/**
 * Generate voucher purchase auto-outreach email — sent immediately on purchase
 */
function generateVoucherOutreachEmail({ buyerName, courseVariant }) {
  const subject = "VES — Your Gift Voucher Purchase";

  const greeting = buyerName ? `Dear ${buyerName},` : 'Dear Customer,';
  const courseLabel = courseVariant || 'Pottery Course';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Gift Voucher Purchased!
    </h1>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for purchasing a <strong>Ves Gift Voucher</strong> for <strong>${courseLabel}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Next Steps</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">
            To reserve a spot, please reply to this email with the following:
          </p>
          <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
            <li>Is this voucher for yourself or someone else?</li>
            <li>If for someone else, please provide their <strong>name</strong> and <strong>email address</strong></li>
            <li>Any preferred schedule or time slot</li>
          </ul>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #888888;">
      This voucher has no expiry and can be redeemed for any available course. Once we have the details, we'll get everything set up and reserve a spot.
    </p>
    <p style="margin: 0 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to hearing from you!
    </p>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateVoucherOutreachEmail };
