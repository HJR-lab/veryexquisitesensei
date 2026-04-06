const { wrapEmailTemplate } = require('../base');

function generate({ dayOfWeek, startDate, timeSlot, specialNotes }) {
  const subject = `VES Course: Kids Let's Play with Clay — ${startDate} (${timeSlot})`;

  const specialNotesBlock = specialNotes ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>` : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Course Details</h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear Parent,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for signing up for our <strong>Kids Let's Play with Clay</strong> session. Please find the details below:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Session Details</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>Date:</strong> ${dayOfWeek}, ${startDate}</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>Time:</strong> ${timeSlot}</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
        <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
          <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
        </p>
      </td></tr>
    </table>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">What to Bring</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Comfortable clothes that can get dirty</li>
      <li>Closed-toe shoes</li>
      <li>An apron (or purchase one for $18)</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>To enter, please press the doorbell on the wall and someone will open the door for you.</li>
      <li>A parent or guardian must accompany children under 12.</li>
      <li>Eating is not allowed in the studio.</li>
    </ul>

    ${specialNotesBlock}

    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to a fun session with your child!
    </p>
    `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
