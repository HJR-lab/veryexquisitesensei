/**
 * Escape a value for interpolation into email HTML.
 *
 * Names, course titles and notes reach these templates from Shopify, where a
 * customer sets their own first_name. That value is embedded in HTML which is
 * stored in sent_emails and later rendered in the admin's browser, so an
 * unescaped name is a stored XSS with the admin's session, not just a broken
 * email. Escape every interpolated value that did not originate in this file.
 *
 * @param {*} value
 * @returns {string} HTML-safe text
 */
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => HTML_ENTITIES[c]);
}

/**
 * Escape a URL for an href/src. Anything that is not plainly http(s) is dropped
 * rather than escaped — javascript: and data: URIs have no business in an email
 * and there is no safe way to render an attacker-chosen scheme.
 *
 * @param {*} value
 * @returns {string} a safe URL, or '' if the scheme is not http(s)
 */
function escUrl(value) {
  const raw = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  return esc(raw);
}

/**
 * Base email template wrapper — VES branded HTML email
 * @param {string} bodyContent - Inner HTML content for the email body
 * @returns {string} Full HTML email string
 */
function wrapEmailTemplate(bodyContent) {
  return `<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #F5F3F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 36px 40px 24px;">
              <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" width="72" style="display: block;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid rgba(40,40,40,0.09); margin: 0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 20px 40px 28px;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #888888;">
                Ves &middot; 75 Jalan Kelabu Asap, Singapore 278268
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #888888;">
                <a href="https://www.ves.sg" style="color: #C4622D; text-decoration: none;">ves.sg</a> &middot;
                <a href="https://club.ves.sg/policies" style="color: #C4622D; text-decoration: none;">Studio Policy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { wrapEmailTemplate, esc, escUrl };
