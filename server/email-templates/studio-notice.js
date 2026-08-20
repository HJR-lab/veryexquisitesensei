const { wrapEmailTemplate, esc, escUrl } = require('./base');

// One look for every studio-facing notice, so an operational alert never
// arrives dressed as a customer email. Callers supply facts, not markup —
// nobody hand-writes HTML into an alert again.
function generate({ headline, facts = [], body, actionLabel, actionUrl, urgency = 'normal', footnote }) {
  const accent = urgency === 'high' ? '#C03030' : '#C4622D';
  const wash = urgency === 'high' ? '#FDECEA' : '#F9EDE6';

  const factRows = facts
    .filter(f => f && f.value !== undefined && f.value !== null && f.value !== '')
    .map(f => `
      <tr>
        <td style="padding: 3px 0; font-size: 13px; color: #888888; width: 34%; vertical-align: top;">${esc(f.label)}</td>
        <td style="padding: 3px 0; font-size: 14px; color: #282828; font-weight: 600;">${esc(f.value)}</td>
      </tr>`)
    .join('');

  const safeAction = escUrl(actionUrl);

  const bodyHtml = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: #282828; font-weight: 600;">
      ${esc(headline)}
    </h2>
    ${factRows ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${wash}; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">${factRows}</table>
      </td></tr>
    </table>` : ''}
    ${body ? `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">${esc(body)}</p>` : ''}
    ${safeAction && actionLabel ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td align="center">
        <a href="${safeAction}" style="display: inline-block; padding: 14px 32px; background-color: ${accent}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          ${esc(actionLabel)}
        </a>
      </td></tr>
    </table>` : ''}
    ${footnote ? `
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">${esc(footnote)}</p>` : ''}
  `;

  return wrapEmailTemplate(bodyHtml);
}

module.exports = { generate };
