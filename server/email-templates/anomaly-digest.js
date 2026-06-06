const { wrapEmailTemplate } = require('./base');

const TYPE_LABEL = {
  over_allocated: 'Over-allocated enrollment',
  stale_unassigned_10class: 'Stale unassigned 10-class package',
};

const SEV_COLOR = {
  high: '#9E1B1B',
  medium: '#9E4A1E',
  low: '#888888',
};

function buildAnomalyDigestEmail({ findings, baseUrl }) {
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const rows = findings.map(f => {
    const label = TYPE_LABEL[f.type] || f.type;
    const sevColor = SEV_COLOR[f.severity] || '#888888';
    const link = baseUrl
      ? `<a href="${baseUrl}/admin/students/${f.student_id}" style="color: #C4622D; text-decoration: none;">${f.student_name}</a>`
      : f.student_name;
    return `
      <tr>
        <td style="padding: 12px 14px; border-bottom: 1px solid rgba(40,40,40,0.09); vertical-align: top;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${sevColor}; margin-bottom: 4px;">
            ${f.severity} &middot; ${label}
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #282828; margin-bottom: 2px;">
            ${link} <span style="font-weight: 400; color: #888;">(#${f.student_id})</span>
          </div>
          <div style="font-size: 12px; color: #555; line-height: 1.45;">
            ${f.details}
          </div>
          <div style="font-size: 11px; color: #888; margin-top: 4px;">
            Enrollment #${f.enrollment_id}
          </div>
        </td>
      </tr>`;
  }).join('');

  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Account anomalies detected
    </h1>
    <p style="margin: 0 0 24px; font-size: 13px; color: #888; text-align: center;">
      Daily probe &middot; ${date} &middot; ${findings.length} finding${findings.length === 1 ? '' : 's'}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid rgba(40,40,40,0.09); border-left: 1px solid rgba(40,40,40,0.09); border-right: 1px solid rgba(40,40,40,0.09);">
      ${rows}
    </table>

    <p style="margin: 24px 0 0; font-size: 12px; color: #888; line-height: 1.5;">
      Source of truth: <code>getEnrollmentCredits</code> (server/utils/supabaseDb.js).
      Re-run anytime via the admin dashboard "Account Anomalies" widget.
    </p>`;

  return wrapEmailTemplate(body);
}

module.exports = { buildAnomalyDigestEmail };
