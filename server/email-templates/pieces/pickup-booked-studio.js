const { wrapEmailTemplate, esc, escUrl } = require('../base');

// Studio-facing, not customer-facing. Sent the moment a student picks a date,
// because until this existed nothing announced a booking at all — the whole
// two-day staging window rested on somebody happening to open the pipeline
// board. The daily digest catches what slips; this is the first shout.
function generate({ studentName, studentEmail, pieceCount, initials, collectionDate, batchId, appUrl }) {
  const count = Number(pieceCount) || 0;
  const safeApp = escUrl(appUrl);
  const pretty = new Date(collectionDate).toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore',
  });

  const subject = `[VES] ${studentName} booked a collection for ${pretty}`;

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: #282828; font-weight: 600;">
      Collection booked
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 6px; font-size: 18px; font-weight: 600; color: #282828;">${esc(pretty)}</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">
          ${esc(studentName)} — ${count} piece${count !== 1 ? 's' : ''}
          ${initials ? `(${esc(initials)})` : ''}
        </p>
        <p style="margin: 0; font-size: 13px; color: #888888;">
          Batch #${esc(batchId)}${studentEmail ? ` · ${esc(studentEmail)}` : ''}
        </p>
      </td></tr>
    </table>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Find the pieces and press <strong>Place in Cabinet</strong> before that date. That is also
      what sends the student their confirmation — until it happens they have only been told we
      have their date, not that the pieces are out.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${safeApp}/admin/pieces" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Open the pipeline
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Anything still unstaged within three days of its date also shows up in the daily digest.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
