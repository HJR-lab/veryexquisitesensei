const { wrapEmailTemplate } = require('../base');

function generate({ dayOfWeek, startDate, endDate, timeSlot, holidayExclusions, collectionStart, collectionEnd, disposalDate, specialNotes }) {
  const subject = `VES Course Details: 7-Week Intermediate Wheelthrowing — ${dayOfWeek}s, ${startDate} - ${endDate} (${timeSlot})`;

  const holidayLine = holidayExclusions ? `<p style="margin: 0 0 2px; font-size: 14px; color: #C4622D; font-weight: 600;">${holidayExclusions}</p>` : '';
  const specialNotesBlock = specialNotes ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>` : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Course Details</h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear VES Student,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for signing up for our <strong>7-Week Intermediate Wheelthrowing</strong> course. Please find the course details below:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Schedule</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>Dates:</strong> ${dayOfWeek}s, ${startDate} – ${endDate} (${timeSlot})</p>
        ${holidayLine}
        <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
        <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
          <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
        </p>
      </td></tr>
    </table>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Description</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      This 7-week intermediate course is designed for students who have completed the beginner course. You will advance your wheel-throwing skills with more complex forms, refined trimming techniques, and expanded glazing methods using special VES glazes.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Fees Include</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Clay, bisque firing (up to 8 pieces), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Class Size and Policies</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Please note that classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Make-Up</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–6, and ONE for week 7 (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      As this is a structured course, please be punctual. The studio opens for entry 10 mins before class begins. Class will begin and end on time.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Tools are required and available for purchase at the start of the course for $15 ($12 for advanced trimming tool).</li>
      <li>Aprons are required and not provided. Alternatively aprons can be purchased for $18.</li>
      <li>Carry bags are not provided. Alternatively tote bags can be purchased for $12.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>To enter, please press the doorbell on the wall and someone will open the door for you.</li>
      <li>Please initial your own work clearly in 3 text/numbers to avoid mix-ups.</li>
      <li>Do clean up after yourself and wipe your seat and wheels clean after use.</li>
      <li>If you are unwell, please wear a mask.</li>
      <li>Wear comfortable clothes and closed-toe shoes.</li>
      <li>Please cut your nails appropriately for the sessions.</li>
      <li>Eating is not allowed in the studio.</li>
      <li>If you are under 16, please notify us in advance.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Studio Policy</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Collection of finished pieces is by appointment only between ${collectionStart} and ${collectionEnd}.</li>
      <li>We reserve the right to dispose of uncollected pieces after ${disposalDate}.</li>
      <li>We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.</li>
    </ul>

    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #282828;">
      For full studio policies, visit <a href="https://club.ves.sg/policies" style="color: #C4622D;">club.ves.sg/policies</a>.
    </p>
    ${specialNotesBlock}
    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Please do not hesitate to contact us if you have any questions. We look forward to seeing you in class!
    </p>
    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Best regards,<br/><strong>Eve</strong><br/><span style="color: #888888;">VES Clay Studio</span>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
      <tr><td align="center">
        <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Manage Your Bookings</a>
      </td></tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
