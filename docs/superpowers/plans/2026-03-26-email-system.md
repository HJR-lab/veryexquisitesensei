# Email System & Studio Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transactional emails via Resend (course details, cohort confirmed, kids outreach), an admin course emails page, a 5-day reminder cron, and a first-login policy agreement flow.

**Architecture:** Resend SDK in `server/utils/emailService.js` sends all emails via mail.ves.sg. Course templates are JS modules returning `{ subject, html }`. Admin panel gets a new "Course Emails" page for drafting/sending. Frontend adds a policy popup gate on first login and a public `/policies` page.

**Tech Stack:** Resend SDK, Express.js, React 18, Supabase PostgreSQL, inline-styled HTML email templates (table-based for email client compatibility)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/utils/emailService.js` | Create | Resend SDK wrapper, send + log functions, course type detection |
| `server/email-templates/base.js` | Create | Shared HTML email wrapper (header, footer, styles) |
| `server/email-templates/cohort-confirmed.js` | Create | "Your class is confirmed" template |
| `server/email-templates/kids-outreach.js` | Create | "Let's arrange your class" template |
| `server/email-templates/courses/wt-6week.js` | Create | 6-week Beginner/Extension WT template |
| `server/email-templates/courses/wt-10class.js` | Create | 10-class WT template |
| `server/email-templates/courses/wt-3x6week.js` | Create | 3x6-week WT package template |
| `server/email-templates/courses/wt-7week-inter.js` | Create | 7-week Intermediate WT template |
| `server/email-templates/courses/hb-8credit.js` | Create | Handbuilding 8-credit template |
| `server/email-templates/courses/kids-clay.js` | Create | Kids Let's Play with Clay template |
| `server/routes/admin.js` | Modify | Add course email endpoints (draft, send, history) |
| `server/routes/shopify.js:1114-1120` | Modify | Add cohort confirmed + kids outreach email triggers |
| `server/utils/cohortAutoProcessor.js:208-234` | Modify | Add 5-day course email reminder to daily cron |
| `server/routes/auth.js:70-91` | Modify | Add `policiesAcceptedAt` to user response |
| `frontend/src/pages/AdminCourseEmails.jsx` | Create | Admin course emails list + draft editor page |
| `frontend/src/components/PolicyPopup.jsx` | Create | First-login policy agreement modal |
| `frontend/src/pages/Policies.jsx` | Create | Public policies page |
| `frontend/src/App.jsx:172-188` | Modify | Add admin route + public policies route |
| `frontend/src/hooks/useAuth.jsx` | Modify | Expose `policiesAcceptedAt` from user object |
| `frontend/src/components/AdminNav.jsx:9-13` | Modify | Add "Emails" link to admin nav |

---

### Task 1: Install Resend SDK and Create Email Service

**Files:**
- Modify: `server/package.json`
- Create: `server/utils/emailService.js`

- [ ] **Step 1: Install Resend**

```bash
cd server && npm install resend
```

- [ ] **Step 2: Create `server/utils/emailService.js`**

```javascript
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'VES Studio <info@ves.sg>';

/**
 * Send an email via Resend
 */
async function sendEmail({ to, bcc, subject, html, replyTo }) {
  try {
    const payload = {
      from: FROM_ADDRESS,
      to: to || FROM_ADDRESS,
      subject,
      html,
    };
    if (bcc && bcc.length > 0) payload.bcc = bcc;
    if (replyTo) payload.reply_to = replyTo;

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error('[Email] Send failed:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Sent "${subject}" to ${bcc ? bcc.length + ' recipients' : to} (ID: ${data.id})`);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('[Email] Send error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send and log a course-related email
 */
async function sendAndLogEmail({ emailType, courseIdentifier, subject, html, recipientEmails, sentBy }) {
  const result = await sendEmail({
    to: FROM_ADDRESS,
    bcc: recipientEmails,
    subject,
    html,
  });

  if (result.success) {
    const { supabase } = require('./supabaseDb');
    await supabase.from('sent_emails').insert({
      email_type: emailType,
      course_identifier: courseIdentifier,
      subject,
      recipient_count: recipientEmails.length,
      recipient_emails: recipientEmails,
      sent_by: sentBy || 'system',
      resend_message_id: result.messageId,
    });
  }

  return result;
}

/**
 * Detect which email template to use for a course enrollment
 */
function detectCourseTemplate(enrollment) {
  const { course_type, number_of_weeks, course_identifier } = enrollment;
  const title = (enrollment.product_title || '').toLowerCase();

  if (title.includes('kids') || title.includes('play with clay')) return 'kids-clay';
  if (course_type && course_type.toLowerCase().includes('handbuilding')) return 'hb-8credit';
  if (number_of_weeks === 10) return 'wt-10class';
  if (number_of_weeks >= 18) return 'wt-3x6week';
  if (number_of_weeks === 7) return 'wt-7week-inter';
  return 'wt-6week';
}

module.exports = { sendEmail, sendAndLogEmail, detectCourseTemplate, FROM_ADDRESS };
```

- [ ] **Step 3: Add RESEND_API_KEY to server/.env**

```
RESEND_API_KEY=re_YOUR_KEY_HERE
```

Note: Get the API key from Resend dashboard (the `supabase-smtp-2` key or create a new one for transactional emails).

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json server/utils/emailService.js
git commit -m "feat: add Resend email service wrapper with send and logging"
```

---

### Task 2: Create `sent_emails` Database Table

**Files:**
- Database migration (Supabase SQL)

- [ ] **Step 1: Create the sent_emails table via Supabase SQL**

Run this SQL in Supabase SQL editor or via MCP tool:

```sql
CREATE TABLE sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type TEXT NOT NULL,
  course_identifier TEXT,
  subject TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  recipient_emails TEXT[],
  sent_by TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_message_id TEXT
);

CREATE INDEX idx_sent_emails_course ON sent_emails(course_identifier);
CREATE INDEX idx_sent_emails_type ON sent_emails(email_type);
```

- [ ] **Step 2: Add `policies_accepted_at` column to customers**

```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS policies_accepted_at TIMESTAMPTZ;
```

- [ ] **Step 3: Verify tables**

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sent_emails';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'policies_accepted_at';
```

---

### Task 3: Create Base Email Template

**Files:**
- Create: `server/email-templates/base.js`

- [ ] **Step 1: Create `server/email-templates/base.js`**

This wraps any email body content in the VES branded layout (matching the magic-link.html design).

```javascript
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
              <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" width="120" style="display: block;" />
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
                VES Clay Studio &middot; 75 Jalan Kelabu Asap, Singapore 278268
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #888888;">
                <a href="https://www.ves.sg" style="color: #C4622D; text-decoration: none;">ves.sg</a> &middot;
                <a href="https://club.ves.sg/policies" style="color: #C4622D; text-decoration: none;">Studio Policies</a>
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

module.exports = { wrapEmailTemplate };
```

- [ ] **Step 2: Commit**

```bash
git add server/email-templates/base.js
git commit -m "feat: add base email template wrapper with VES branding"
```

---

### Task 4: Create Cohort Confirmed Email Template

**Files:**
- Create: `server/email-templates/cohort-confirmed.js`

- [ ] **Step 1: Create `server/email-templates/cohort-confirmed.js`**

```javascript
const { wrapEmailTemplate } = require('./base');

/**
 * Generate cohort confirmed email — sent when 4-student threshold is met
 * @param {Object} params
 * @param {string} params.courseType - e.g. "Wheelthrowing"
 * @param {string} params.dayOfWeek - e.g. "Friday"
 * @param {string} params.startDate - e.g. "14 March 2025"
 * @param {string} params.endDate - e.g. "25 April 2025"
 * @param {string} params.timeSlot - e.g. "9:30am - 12:00pm"
 * @returns {{ subject: string, html: string }}
 */
function generateCohortConfirmedEmail({ courseType, dayOfWeek, startDate, endDate, timeSlot }) {
  const subject = `VES — Your ${courseType} Class is Confirmed!`;

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Your Class is Confirmed!
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Great news — your <strong>${courseType}</strong> class has enough students and is confirmed!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Schedule</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${dayOfWeek}s, ${startDate} – ${endDate}</p>
          <p style="margin: 0; font-size: 15px; color: #282828;">${timeSlot}</p>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #282828;">
      <strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268
      (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)
    </p>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #888888;">
      You'll receive detailed course information closer to your start date.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            View Your Bookings
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateCohortConfirmedEmail };
```

- [ ] **Step 2: Commit**

```bash
git add server/email-templates/cohort-confirmed.js
git commit -m "feat: add cohort confirmed email template"
```

---

### Task 5: Create Kids Outreach Email Template

**Files:**
- Create: `server/email-templates/kids-outreach.js`

- [ ] **Step 1: Create `server/email-templates/kids-outreach.js`**

```javascript
const { wrapEmailTemplate } = require('./base');

/**
 * Generate kids course auto-outreach email — sent immediately on purchase
 * @param {Object} params
 * @param {string} params.parentName - Parent's first name
 * @returns {{ subject: string, html: string }}
 */
function generateKidsOutreachEmail({ parentName }) {
  const subject = "VES — Let's Play with Clay: Let's Arrange Your Class!";

  const greeting = parentName ? `Dear ${parentName},` : 'Dear Parent,';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Let's Play with Clay!
    </h1>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      ${greeting}
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for purchasing our <strong>Kids Let's Play with Clay</strong> session! We're excited to have your child join us at the studio.
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Please reply to this email to arrange your preferred date and time, and we'll get everything set up for you.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Studio Location</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
          <p style="margin: 0; font-size: 14px; color: #888888;">
            <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">View on Google Maps</a> &middot; Nearest MRT: Holland Village
          </p>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #282828;">
      We look forward to hearing from you!
    </p>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Best regards,<br/>
      <strong>Eve</strong><br/>
      <span style="color: #888888;">VES Clay Studio</span>
    </p>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generateKidsOutreachEmail };
```

- [ ] **Step 2: Commit**

```bash
git add server/email-templates/kids-outreach.js
git commit -m "feat: add kids course auto-outreach email template"
```

---

### Task 6: Create Course Detail Email Templates (6 templates)

**Files:**
- Create: `server/email-templates/courses/wt-6week.js`
- Create: `server/email-templates/courses/wt-10class.js`
- Create: `server/email-templates/courses/wt-3x6week.js`
- Create: `server/email-templates/courses/wt-7week-inter.js`
- Create: `server/email-templates/courses/hb-8credit.js`
- Create: `server/email-templates/courses/kids-clay.js`

All templates share a common signature and use the base wrapper. Each returns `{ subject, html }`.

- [ ] **Step 1: Create `server/email-templates/courses/wt-6week.js`**

```javascript
const { wrapEmailTemplate } = require('../base');

/**
 * 6-Week Beginner/Extension Wheelthrowing course details email
 * @param {Object} params
 * @param {string} params.dayOfWeek - e.g. "Friday"
 * @param {string} params.startDate - e.g. "14 March"
 * @param {string} params.endDate - e.g. "25 April"
 * @param {string} params.timeSlot - e.g. "9:30am - 12:00pm"
 * @param {string} params.holidayExclusions - e.g. "NO CLASS 18 APR GOOD FRIDAY"
 * @param {string} params.collectionStart - e.g. "5 May"
 * @param {string} params.collectionEnd - e.g. "30 June"
 * @param {string} params.disposalDate - e.g. "30 June 2025"
 * @param {string} params.specialNotes - admin free text (optional)
 * @returns {{ subject: string, html: string }}
 */
function generate({ dayOfWeek, startDate, endDate, timeSlot, holidayExclusions, collectionStart, collectionEnd, disposalDate, specialNotes }) {
  const subject = `VES Course Details: 6-Week Wheelthrowing — ${dayOfWeek}s, ${startDate} - ${endDate} (${timeSlot})`;

  const holidayLine = holidayExclusions
    ? `<p style="margin: 0 0 2px; font-size: 14px; color: #C4622D; font-weight: 600;">${holidayExclusions}</p>`
    : '';

  const specialNotesBlock = specialNotes
    ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>`
    : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Course Details
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Dear VES Student,
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for signing up for our <strong>6-week Beginner/Extension Wheelthrowing</strong>. Please find the course details below:
    </p>

    <!-- Schedule Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Schedule</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>Dates:</strong> ${dayOfWeek}s, ${startDate} – ${endDate} (${timeSlot})</p>
          ${holidayLine}
          <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
          <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
            <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
          </p>
        </td>
      </tr>
    </table>

    <!-- Course Description -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Description</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      This 6-week course will teach you the fundamentals of wheel-throwing. You will learn how to throw cylinder and bowl forms, turn/trim bases, and apply glazing techniques using special VES glazes. By the end of the course, you will have your own set of glazed pots and bowls, which can be collected within one month after the final class.
    </p>

    <!-- Fees -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Fees Include</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Clay, bisque firing (up to 7 pieces), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.
    </p>

    <!-- Class Size -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Class Size and Policies</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Please note that classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.
    </p>

    <!-- Makeup -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Make-Up</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.
    </p>

    <!-- Punctuality -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      As this is a structured course, please be punctual. The studio opens for entry 10 mins before class begins. Class will begin and end on time.
    </p>

    <!-- Items Required -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Tools are required and available for purchase at the start of the course for $15 ($12 for advanced trimming tool). Alternatively, if you have your own set please bring it along.</li>
      <li>Aprons are required and not provided, so please bring your own. Alternatively aprons can be purchased for $18.</li>
      <li>Carry bags are not provided, so please bring your own for your wares. Alternatively tote bags can be purchased for $12.</li>
    </ul>

    <!-- Additional Info -->
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>To enter, please press the doorbell on the wall and someone will open the door for you.</li>
      <li>Please initial your own work clearly in 3 text/numbers to avoid mix-ups.</li>
      <li>Do clean up after yourself and wipe your seat and wheels clean after use for the next user.</li>
      <li>If you are unwell, please wear a mask.</li>
      <li>Wear comfortable clothes and closed-toe shoes.</li>
      <li>Please cut your nails appropriately for the sessions.</li>
      <li>Eating is not allowed in the studio.</li>
      <li>If you are under 16, please notify us in advance.</li>
    </ul>

    <!-- Studio Policy -->
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
      Best regards,<br/>
      <strong>Eve</strong><br/>
      <span style="color: #888888;">VES Clay Studio</span>
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
      <tr>
        <td align="center">
          <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Manage Your Bookings
          </a>
        </td>
      </tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 2: Create `server/email-templates/courses/wt-10class.js`**

Same structure as wt-6week.js but with these content differences:
- Title: "10-Class Wheelthrowing"
- Description: Mentions 6 weeks structured + 4 flexible classes
- Fees: "up to 10 pieces"
- Subject line: `VES Course Details: 10-Class Wheelthrowing — ...`

```javascript
const { wrapEmailTemplate } = require('../base');

function generate({ dayOfWeek, startDate, endDate, timeSlot, holidayExclusions, collectionStart, collectionEnd, disposalDate, specialNotes }) {
  const subject = `VES Course Details: 10-Class Wheelthrowing — ${dayOfWeek}s, ${startDate} - ${endDate} (${timeSlot})`;

  const holidayLine = holidayExclusions
    ? `<p style="margin: 0 0 2px; font-size: 14px; color: #C4622D; font-weight: 600;">${holidayExclusions}</p>`
    : '';

  const specialNotesBlock = specialNotes
    ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>`
    : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      Course Details
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Dear VES Student,
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for signing up for our <strong>10-Class Wheelthrowing</strong> package. Please find the course details below:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Schedule</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>Dates:</strong> ${dayOfWeek}s, ${startDate} – ${endDate} (${timeSlot})</p>
          ${holidayLine}
          <p style="margin: 4px 0 0; font-size: 14px; color: #282828;">6 structured weeks + 4 flexible classes (WT or HB)</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
          <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
            <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
          </p>
        </td>
      </tr>
    </table>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Description</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      This package includes a 6-week structured wheelthrowing course plus 4 flexible classes that can be used for additional wheelthrowing or handbuilding sessions. The structured course teaches the fundamentals of wheel-throwing including cylinder and bowl forms, turning/trimming, and glazing with special VES glazes. Flexible classes can be booked at your convenience through club.ves.sg.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Fees Include</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Clay, bisque firing (up to 10 pieces), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Class Size and Policies</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Please note that classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Make-Up</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      As this is a structured course, please be punctual. The studio opens for entry 10 mins before class begins. Class will begin and end on time.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Tools are required and available for purchase at the start of the course for $15 ($12 for advanced trimming tool). Alternatively, if you have your own set please bring it along.</li>
      <li>Aprons are required and not provided, so please bring your own. Alternatively aprons can be purchased for $18.</li>
      <li>Carry bags are not provided, so please bring your own for your wares. Alternatively tote bags can be purchased for $12.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>To enter, please press the doorbell on the wall and someone will open the door for you.</li>
      <li>Please initial your own work clearly in 3 text/numbers to avoid mix-ups.</li>
      <li>Do clean up after yourself and wipe your seat and wheels clean after use for the next user.</li>
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
```

- [ ] **Step 3: Create `server/email-templates/courses/wt-3x6week.js`**

Same structure, differences:
- Title: "3-Course Wheelthrowing Package"
- Description: "This package includes three 6-week wheelthrowing courses (18 weeks total)..."
- Fees: "up to 21 pieces (7 per course)"

```javascript
const { wrapEmailTemplate } = require('../base');

function generate({ dayOfWeek, startDate, endDate, timeSlot, holidayExclusions, collectionStart, collectionEnd, disposalDate, specialNotes }) {
  const subject = `VES Course Details: 3-Course Wheelthrowing Package — ${dayOfWeek}s, ${startDate} - ${endDate} (${timeSlot})`;

  const holidayLine = holidayExclusions ? `<p style="margin: 0 0 2px; font-size: 14px; color: #C4622D; font-weight: 600;">${holidayExclusions}</p>` : '';
  const specialNotesBlock = specialNotes ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>` : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Course Details</h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear VES Student,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for signing up for our <strong>3-Course Wheelthrowing Package</strong>. Please find the course details below:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Schedule</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>Dates:</strong> ${dayOfWeek}s, ${startDate} – ${endDate} (${timeSlot})</p>
        ${holidayLine}
        <p style="margin: 4px 0 0; font-size: 14px; color: #282828;">3 consecutive 6-week courses (18 weeks total)</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
        <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
          <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
        </p>
      </td></tr>
    </table>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Description</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      This package includes three consecutive 6-week wheelthrowing courses (18 weeks total). You will progressively build your skills from fundamentals through advanced techniques, including cylinder and bowl forms, turning/trimming, and glazing with special VES glazes.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Course Fees Include</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Clay, bisque firing (up to 21 pieces — 7 per course), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Class Size and Policies</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Please note that classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Make-Up</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing) of each course cycle, subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.
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
```

- [ ] **Step 4: Create `server/email-templates/courses/wt-7week-inter.js`**

Differences from wt-6week:
- Title: "7-Week Intermediate Wheelthrowing"
- Description: focused on advancing skills, more complex forms
- Fees: "up to 8 pieces"

```javascript
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
```

- [ ] **Step 5: Create `server/email-templates/courses/hb-8credit.js`**

Different content — handbuilding is drop-in, no fixed schedule, no makeup policy, no wheel references:

```javascript
const { wrapEmailTemplate } = require('../base');

function generate({ specialNotes }) {
  const subject = 'VES Course Details: Handbuilding 8-Credit Package';

  const specialNotesBlock = specialNotes ? `<p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #C4622D; font-weight: 600;">${specialNotes}</p>` : '';

  const body = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Course Details</h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Dear VES Student,</p>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
      Thank you for purchasing our <strong>Handbuilding 8-Credit Package</strong>. Please find the details below:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
      <tr><td style="padding: 16px 20px;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your Package</p>
        <p style="margin: 0 0 2px; font-size: 15px; color: #282828;"><strong>8 class credits</strong> — book sessions at your convenience</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268</p>
        <p style="margin: 2px 0 0; font-size: 13px; color: #888888;">
          <a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Google Maps</a> &middot; Nearest MRT: Holland Village &middot; No on-site parking
        </p>
      </td></tr>
    </table>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">How It Works</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Your 8 credits can be used to book individual handbuilding sessions. Browse available classes and book at your convenience through <a href="https://club.ves.sg/classes" style="color: #C4622D;">club.ves.sg</a>.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Package Fees Include</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Clay, bisque firing, tools and equipment use, decorating and glazing materials, and glaze firing. Additional pieces will incur extra charges.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Punctuality</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Please be punctual. The studio opens for entry 10 mins before class begins. Class will begin and end on time.
    </p>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Items Required</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>Aprons are required and not provided. Alternatively aprons can be purchased for $18.</li>
      <li>Carry bags are not provided. Alternatively tote bags can be purchased for $12.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Additional Information</h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #282828;">
      <li>To enter, please press the doorbell on the wall and someone will open the door for you.</li>
      <li>Please initial your own work clearly in 3 text/numbers to avoid mix-ups.</li>
      <li>Do clean up after yourself and wipe your work area clean after use.</li>
      <li>If you are unwell, please wear a mask.</li>
      <li>Wear comfortable clothes and closed-toe shoes.</li>
      <li>Eating is not allowed in the studio.</li>
      <li>If you are under 16, please notify us in advance.</li>
    </ul>

    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #282828;">Studio Policy</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #282828;">
      Classes are non-refundable. We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.
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
        <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Book Your Classes</a>
      </td></tr>
    </table>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 6: Create `server/email-templates/courses/kids-clay.js`**

This is the template used in the admin draft view (not the auto-outreach). For when admin wants to send course details after arranging the date:

```javascript
const { wrapEmailTemplate } = require('../base');

function generate({ dayOfWeek, startDate, timeSlot, specialNotes }) {
  const subject = `VES Course Details: Kids Let's Play with Clay — ${startDate} (${timeSlot})`;

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
    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6; color: #282828;">
      Best regards,<br/><strong>Eve</strong><br/><span style="color: #888888;">VES Clay Studio</span>
    </p>`;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 7: Commit all 6 course templates**

```bash
git add server/email-templates/courses/
git commit -m "feat: add 6 course detail email templates (WT 6wk/10cl/3x6/7wk, HB 8cr, kids)"
```

---

### Task 7: Wire Cohort Confirmed Email into Webhook

**Files:**
- Modify: `server/routes/shopify.js:1114-1120`

- [ ] **Step 1: Add email import at top of shopify.js**

At the top of `server/routes/shopify.js`, add after the existing requires:

```javascript
const { sendAndLogEmail } = require('../utils/emailService');
const { generateCohortConfirmedEmail } = require('../email-templates/cohort-confirmed');
```

- [ ] **Step 2: Add cohort email send after threshold met**

In `server/routes/shopify.js`, modify the block at line ~1114-1120. Replace:

```javascript
          if (result.success) {
            console.log(`✅ Course enrollment processed successfully`);
            if (result.thresholdMet) {
              console.log(`🎉 Threshold met! Created ${result.classInstancesCreated} class instances and ${result.bookingsCreated} bookings`);
            } else if (result.requiresThreshold) {
              console.log(`⏳ Waiting for more students (${result.studentCount}/${result.studentsNeeded + result.studentCount})`);
            }
          }
```

With:

```javascript
          if (result.success) {
            console.log(`✅ Course enrollment processed successfully`);
            if (result.thresholdMet) {
              console.log(`🎉 Threshold met! Created ${result.classInstancesCreated} class instances and ${result.bookingsCreated} bookings`);

              // Send cohort confirmed email to all students in the cohort
              try {
                if (result.cohortStudentEmails && result.cohortStudentEmails.length > 0) {
                  const { subject, html } = generateCohortConfirmedEmail({
                    courseType: result.courseType || 'Wheelthrowing',
                    dayOfWeek: result.dayOfWeek || '',
                    startDate: result.startDate || '',
                    endDate: result.endDate || '',
                    timeSlot: result.timeSlot || '',
                  });
                  await sendAndLogEmail({
                    emailType: 'cohort_confirmed',
                    courseIdentifier: result.courseIdentifier || '',
                    subject,
                    html,
                    recipientEmails: result.cohortStudentEmails,
                    sentBy: 'system',
                  });
                }
              } catch (emailErr) {
                console.error('[Email] Failed to send cohort confirmed email:', emailErr);
                // Don't fail the webhook response for email errors
              }
            } else if (result.requiresThreshold) {
              console.log(`⏳ Waiting for more students (${result.studentCount}/${result.studentsNeeded + result.studentCount})`);
            }
          }
```

- [ ] **Step 3: Update courseEnrollmentManager.js to return email data**

In `server/utils/courseEnrollmentManager.js`, the `processCoursePurchase` function needs to return `cohortStudentEmails`, `courseType`, `dayOfWeek`, `startDate`, `endDate`, `timeSlot`, and `courseIdentifier` when threshold is met.

Find the return statement inside the threshold-met branch (around line 295-310 area after `activateDraftClasses` or `createClassesAndBookings` succeeds). The return object currently includes `thresholdMet: true`. Add these fields to the same return:

```javascript
// After the threshold processing succeeds, gather cohort student emails
const cohortEmails = cohortEnrollments
  .map(e => e.students?.email || e.email)
  .filter(Boolean);

// Add to the return object:
cohortStudentEmails: cohortEmails,
courseType: courseInfo.courseType,
dayOfWeek: courseInfo.schedulePattern,
startDate: courseInfo.startDate,
endDate: courseInfo.endDate || '',
timeSlot: courseInfo.timeSlot || '',
courseIdentifier: enrollment.course_identifier,
```

Note: The exact location and variable names depend on the existing return structure. Read the full function to identify the exact return statement to modify.

- [ ] **Step 4: Commit**

```bash
git add server/routes/shopify.js server/utils/courseEnrollmentManager.js
git commit -m "feat: send cohort confirmed email when WT threshold is met"
```

---

### Task 8: Wire Kids Auto-Outreach Email into Webhook

**Files:**
- Modify: `server/routes/shopify.js:1078-1125`

- [ ] **Step 1: Add kids email import**

At the top of `server/routes/shopify.js` (alongside the cohort import from Task 7):

```javascript
const { generateKidsOutreachEmail } = require('../email-templates/kids-outreach');
```

- [ ] **Step 2: Add kids detection and auto-send in webhook handler**

In the order webhook handler, after the line item processing loop (around line 1124, after the `for` loop closes), add before the `res.status(200)` line:

```javascript
        // Check for kids course purchases and auto-send outreach email
        for (const item of lineItems) {
          const title = (item.title || '').toLowerCase();
          if (title.includes('kids') || title.includes('play with clay')) {
            try {
              const parentName = order.customer?.first_name || '';
              const parentEmail = order.customer?.email;
              if (parentEmail) {
                const { subject, html } = generateKidsOutreachEmail({ parentName });
                await sendAndLogEmail({
                  emailType: 'kids_outreach',
                  courseIdentifier: 'KIDS',
                  subject,
                  html,
                  recipientEmails: [parentEmail],
                  sentBy: 'system',
                });
                console.log(`📧 Kids outreach email sent to ${parentEmail}`);
              }
            } catch (emailErr) {
              console.error('[Email] Failed to send kids outreach:', emailErr);
            }
          }
        }
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/shopify.js
git commit -m "feat: auto-send kids outreach email on purchase"
```

---

### Task 9: Add Admin Course Email Endpoints

**Files:**
- Modify: `server/routes/admin.js`

- [ ] **Step 1: Add imports at top of admin.js**

```javascript
const { sendAndLogEmail, detectCourseTemplate } = require('../utils/emailService');
```

- [ ] **Step 2: Add GET /api/admin/course-emails endpoint**

Add near the end of `server/routes/admin.js` (before `module.exports`):

```javascript
// ============================================
// COURSE EMAIL ENDPOINTS
// ============================================

// List upcoming courses that need emails sent
app.get('/api/admin/course-emails', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    // Get active/pending enrollments with future start dates (within 14 days)
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Get distinct course identifiers with upcoming classes
    const { data: upcomingClasses, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_type, class_date, start_time, end_time')
      .gte('class_date', now.toISOString().split('T')[0])
      .lte('class_date', fourteenDaysFromNow.toISOString().split('T')[0])
      .order('class_date', { ascending: true });

    if (error) throw error;

    // Group by base course identifier (e.g., WT0503NT_JL6 from WT0503NT_JL6.1)
    const courseGroups = {};
    for (const cls of upcomingClasses || []) {
      const baseId = cls.class_type.split('.')[0];
      if (!courseGroups[baseId]) {
        courseGroups[baseId] = { classes: [], firstDate: cls.class_date };
      }
      courseGroups[baseId].classes.push(cls);
    }

    // Get sent email status for these courses
    const courseIds = Object.keys(courseGroups);
    const { data: sentEmails } = await supabaseDb.supabase
      .from('sent_emails')
      .select('course_identifier, sent_at, email_type')
      .in('course_identifier', courseIds)
      .eq('email_type', 'course_details');

    const sentMap = {};
    for (const se of sentEmails || []) {
      sentMap[se.course_identifier] = se.sent_at;
    }

    // Get student counts per course
    const courses = [];
    for (const [courseId, group] of Object.entries(courseGroups)) {
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, student_id, course_type, number_of_weeks, status')
        .like('course_identifier', `${courseId}%`)
        .in('status', ['active', 'pending']);

      const firstClass = group.classes[0];
      const lastClass = group.classes[group.classes.length - 1];

      courses.push({
        courseIdentifier: courseId,
        courseType: enrollments?.[0]?.course_type || 'Unknown',
        numberOfWeeks: enrollments?.[0]?.number_of_weeks || 6,
        startDate: firstClass?.class_date,
        endDate: lastClass?.class_date,
        timeSlot: firstClass ? `${firstClass.start_time} - ${firstClass.end_time}` : '',
        studentCount: enrollments?.length || 0,
        emailSentAt: sentMap[courseId] || null,
      });
    }

    res.json({ courses });
  } catch (error) {
    console.error('Error fetching course emails:', error);
    res.status(500).json({ error: 'Failed to fetch course emails' });
  }
});
```

- [ ] **Step 3: Add GET /api/admin/course-emails/:courseId/draft endpoint**

```javascript
// Generate email draft for a course
app.get('/api/admin/course-emails/:courseId/draft', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { courseId } = req.params;

    // Get enrollments for this course
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*, students:student_id(id, email, first_name, last_name)')
      .like('course_identifier', `${courseId}%`)
      .in('status', ['active', 'pending']);

    // Get class instances for dates
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_type, class_date, start_time, end_time')
      .like('class_type', `${courseId}%`)
      .order('class_date', { ascending: true });

    if (!classes || classes.length === 0) {
      return res.status(404).json({ error: 'No classes found for this course' });
    }

    const firstClass = classes[0];
    const lastClass = classes[classes.length - 1];
    const startDate = new Date(firstClass.class_date);
    const endDate = new Date(lastClass.class_date);

    // Auto-calculate collection and disposal dates
    const collectionStart = new Date(endDate);
    collectionStart.setMonth(collectionStart.getMonth() + 1);
    const disposalDate = new Date(endDate);
    disposalDate.setMonth(disposalDate.getMonth() + 3);

    // Detect template type
    const enrollment = enrollments?.[0] || {};
    const templateType = detectCourseTemplate(enrollment);

    // Format dates
    const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const formatShortDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    const dayOfWeek = startDate.toLocaleDateString('en-GB', { weekday: 'long' });

    // Student list
    const students = (enrollments || []).map(e => ({
      id: e.students?.id || e.student_id,
      email: e.students?.email || '',
      firstName: e.students?.first_name || '',
      lastName: e.students?.last_name || '',
      selected: true,
    }));

    res.json({
      courseIdentifier: courseId,
      templateType,
      dayOfWeek,
      startDate: formatShortDate(startDate),
      endDate: formatShortDate(endDate),
      timeSlot: `${firstClass.start_time} - ${firstClass.end_time}`,
      collectionStart: formatShortDate(collectionStart),
      collectionEnd: formatDate(new Date(collectionStart.getTime() + 30 * 24 * 60 * 60 * 1000)),
      disposalDate: formatDate(disposalDate),
      holidayExclusions: '',
      specialNotes: '',
      students,
      classDates: classes.map(c => c.class_date),
    });
  } catch (error) {
    console.error('Error generating draft:', error);
    res.status(500).json({ error: 'Failed to generate draft' });
  }
});
```

- [ ] **Step 4: Add POST /api/admin/course-emails/:courseId/send endpoint**

```javascript
// Send course detail email
app.post('/api/admin/course-emails/:courseId/send', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { courseId } = req.params;
    const { templateType, dayOfWeek, startDate, endDate, timeSlot, holidayExclusions, specialNotes, collectionStart, collectionEnd, disposalDate, recipientEmails } = req.body;

    if (!recipientEmails || recipientEmails.length === 0) {
      return res.status(400).json({ error: 'No recipients selected' });
    }

    // Load the correct template
    const templateMap = {
      'wt-6week': require('../email-templates/courses/wt-6week'),
      'wt-10class': require('../email-templates/courses/wt-10class'),
      'wt-3x6week': require('../email-templates/courses/wt-3x6week'),
      'wt-7week-inter': require('../email-templates/courses/wt-7week-inter'),
      'hb-8credit': require('../email-templates/courses/hb-8credit'),
      'kids-clay': require('../email-templates/courses/kids-clay'),
    };

    const template = templateMap[templateType];
    if (!template) {
      return res.status(400).json({ error: `Unknown template type: ${templateType}` });
    }

    const { subject, html } = template.generate({
      dayOfWeek,
      startDate,
      endDate,
      timeSlot,
      holidayExclusions,
      specialNotes,
      collectionStart,
      collectionEnd,
      disposalDate,
    });

    const result = await sendAndLogEmail({
      emailType: 'course_details',
      courseIdentifier: courseId,
      subject,
      html,
      recipientEmails,
      sentBy: req.user.email || 'admin',
    });

    if (!result.success) {
      return res.status(500).json({ error: 'Failed to send email', details: result.error });
    }

    res.json({ success: true, messageId: result.messageId, recipientCount: recipientEmails.length });
  } catch (error) {
    console.error('Error sending course email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});
```

- [ ] **Step 5: Add GET /api/admin/course-emails/history endpoint**

```javascript
// Get sent email history
app.get('/api/admin/course-emails/history', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { data, error } = await supabaseDb.supabase
      .from('sent_emails')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ emails: data || [] });
  } catch (error) {
    console.error('Error fetching email history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat: add admin course email endpoints (list, draft, send, history)"
```

---

### Task 10: Add 5-Day Reminder to Cron

**Files:**
- Modify: `server/utils/cohortAutoProcessor.js`

- [ ] **Step 1: Add reminder function**

Add before `startAutomaticProcessing()` in `server/utils/cohortAutoProcessor.js`:

```javascript
/**
 * Check for courses starting in 5 days that haven't had their details email sent
 */
async function checkCourseEmailReminders() {
  try {
    const { sendEmail } = require('./emailService');

    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const targetDate = fiveDaysFromNow.toISOString().split('T')[0];

    // Find class instances on that date
    const { data: classes } = await supabase
      .from('class_instances')
      .select('class_type, class_date')
      .eq('class_date', targetDate);

    if (!classes || classes.length === 0) return;

    // Get unique base course IDs
    const courseIds = [...new Set(classes.map(c => c.class_type.split('.')[0]))];

    // Check which have sent emails
    const { data: sentEmails } = await supabase
      .from('sent_emails')
      .select('course_identifier')
      .in('course_identifier', courseIds)
      .eq('email_type', 'course_details');

    const sentSet = new Set((sentEmails || []).map(e => e.course_identifier));
    const unsent = courseIds.filter(id => !sentSet.has(id));

    if (unsent.length === 0) return;

    // Get student counts for unsent courses
    const reminders = [];
    for (const courseId of unsent) {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('id')
        .like('course_identifier', `${courseId}%`)
        .in('status', ['active', 'pending']);

      reminders.push(`• ${courseId} — ${(enrollments || []).length} students enrolled`);
    }

    // Send reminder to admin
    await sendEmail({
      to: 'info@ves.sg',
      subject: `VES Admin: ${unsent.length} course email${unsent.length > 1 ? 's' : ''} pending`,
      html: `<p>The following courses start in 5 days and haven't had their course details email sent:</p><p>${reminders.join('<br/>')}</p><p><a href="https://club.ves.sg/admin/course-emails">Review and send course emails</a></p>`,
    });

    console.log(`[Auto-Processor] Sent course email reminder for ${unsent.length} courses`);
  } catch (error) {
    console.error('[Auto-Processor] Course email reminder failed:', error);
  }
}
```

- [ ] **Step 2: Add to daily cron run**

Modify the `runDailyCheck` function to also call the new function. Change:

```javascript
    if (hour === 2 && minute === 0) {
      console.log('[Auto-Processor] Running daily scheduled check...');
      processReadyCohorts().catch(console.error);
      autoMarkPastBookingsAsAttended().catch(console.error);
    }
```

To:

```javascript
    if (hour === 2 && minute === 0) {
      console.log('[Auto-Processor] Running daily scheduled check...');
      processReadyCohorts().catch(console.error);
      autoMarkPastBookingsAsAttended().catch(console.error);
      checkCourseEmailReminders().catch(console.error);
    }
```

- [ ] **Step 3: Export the new function**

Update `module.exports` to include `checkCourseEmailReminders`:

```javascript
module.exports = {
  processReadyCohorts,
  autoMarkPastBookingsAsAttended,
  checkCourseEmailReminders,
  startAutomaticProcessing
};
```

- [ ] **Step 4: Commit**

```bash
git add server/utils/cohortAutoProcessor.js
git commit -m "feat: add 5-day course email reminder to daily cron"
```

---

### Task 11: Add Policy Acceptance to Auth Endpoint

**Files:**
- Modify: `server/routes/auth.js:70-91`

- [ ] **Step 1: Add policiesAcceptedAt to user response**

In `server/routes/auth.js`, modify the response object at line ~70-91. Add after `customerType`:

```javascript
        policiesAcceptedAt: customer.policies_accepted_at || null,
```

- [ ] **Step 2: Add POST /api/user/accept-policies endpoint**

Add after the `/api/auth/me` endpoint in `server/routes/auth.js`:

```javascript
// Accept studio policies
app.post('/api/user/accept-policies', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const { error } = await supabaseDb.supabase
      .from('customers')
      .update({ policies_accepted_at: new Date().toISOString() })
      .eq('id', dbCustomerId);

    if (error) throw error;

    // Invalidate auth cache so next /me call returns updated value
    invalidateAuthCache();

    res.json({ success: true });
  } catch (error) {
    console.error('Error accepting policies:', error);
    res.status(500).json({ error: 'Failed to accept policies' });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add policies_accepted_at to auth response and accept-policies endpoint"
```

---

### Task 12: Create Policy Popup Component

**Files:**
- Create: `frontend/src/components/PolicyPopup.jsx`

- [ ] **Step 1: Create `frontend/src/components/PolicyPopup.jsx`**

```jsx
import { useState } from 'react';
import api from '../utils/api';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888888';

export default function PolicyPopup({ onAccepted }) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await api.post('/user/accept-policies');
      onAccepted();
    } catch (err) {
      console.error('Failed to accept policies:', err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '12px', maxWidth: '560px', width: '100%',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 16px', textAlign: 'center', flexShrink: 0 }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES" style={{ height: '40px', marginBottom: '12px' }}
          />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: INK }}>Studio Policies</h2>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: MUTED }}>Please review and accept before continuing</p>
        </div>

        {/* Scrollable Policy Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 32px 16px',
          fontSize: '13px', lineHeight: '1.7', color: INK,
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Class Size and Policies</h3>
          <p>To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Make-Up Classes</h3>
          <p>While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for the final week (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Punctuality</h3>
          <p>As this is a structured course, please be punctual. The studio opens for entry 10 minutes before class begins. Class will begin and end on time.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Items Required</h3>
          <ul style={{ paddingLeft: '20px', margin: '0 0 8px' }}>
            <li>Tools — available for purchase ($15, $12 for advanced trimming tool) or bring your own</li>
            <li>Apron — required, not provided (available for $18)</li>
            <li>Carry bag — not provided (tote bags available for $12)</li>
          </ul>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Studio Rules</h3>
          <ul style={{ paddingLeft: '20px', margin: '0 0 8px' }}>
            <li>Press the doorbell on the wall to enter</li>
            <li>Initial your work clearly in 3 text/numbers to avoid mix-ups</li>
            <li>Clean up after yourself and wipe your seat and wheels</li>
            <li>Wear a mask if you are unwell</li>
            <li>Wear comfortable clothes and closed-toe shoes</li>
            <li>Cut your nails appropriately</li>
            <li>Eating is not allowed in the studio</li>
            <li>If you are under 16, please notify us in advance</li>
          </ul>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Collection &amp; Disposal</h3>
          <p>Collection of finished pieces is by appointment only, within 1 month after your final class. We reserve the right to dispose of uncollected pieces after 3 months. Please contact us to arrange collection.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>General</h3>
          <p>We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.</p>
        </div>

        {/* Footer — Checkbox + Button */}
        <div style={{
          padding: '16px 32px 24px', borderTop: '1px solid rgba(40,40,40,0.09)', flexShrink: 0,
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: '2px', accentColor: TC }}
            />
            <span style={{ fontSize: '13px', color: INK, lineHeight: '1.5' }}>
              I have read and agree to the VES Clay Studio policies
            </span>
          </label>
          <button
            onClick={handleAccept}
            disabled={!agreed || submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
              backgroundColor: agreed ? TC : '#ccc', color: '#fff',
              fontSize: '15px', fontWeight: 600, cursor: agreed ? 'pointer' : 'default',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/PolicyPopup.jsx
git commit -m "feat: add first-login policy agreement popup component"
```

---

### Task 13: Wire Policy Popup into App + Create Policies Page

**Files:**
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/pages/Policies.jsx`

- [ ] **Step 1: Create `frontend/src/pages/Policies.jsx`**

```jsx
const INK = '#282828';
const MUTED = '#888888';
const TC = '#C4622D';

export default function Policies() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <img
          src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
          alt="VES" style={{ height: '48px', marginBottom: '16px' }}
        />
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: INK }}>Studio Policies</h1>
        <p style={{ margin: '8px 0 0', fontSize: '14px', color: MUTED }}>VES Clay Studio &middot; 75 Jalan Kelabu Asap, Singapore 278268</p>
      </div>

      <div style={{ fontSize: '14px', lineHeight: '1.7', color: INK }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Class Size and Policies</h2>
        <p>To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Make-Up Classes</h2>
        <p>While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for the final week (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Punctuality</h2>
        <p>As this is a structured course, please be punctual. The studio opens for entry 10 minutes before class begins. Class will begin and end on time.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Items Required</h2>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Tools — available for purchase ($15, $12 for advanced trimming tool) or bring your own</li>
          <li>Apron — required, not provided (available for $18)</li>
          <li>Carry bag — not provided (tote bags available for $12)</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Studio Rules</h2>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Press the doorbell on the wall to enter</li>
          <li>Initial your work clearly in 3 text/numbers to avoid mix-ups</li>
          <li>Clean up after yourself and wipe your seat and wheels</li>
          <li>Wear a mask if you are unwell</li>
          <li>Wear comfortable clothes and closed-toe shoes</li>
          <li>Cut your nails appropriately</li>
          <li>Eating is not allowed in the studio</li>
          <li>If you are under 16, please notify us in advance</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Collection &amp; Disposal</h2>
        <p>Collection of finished pieces is by appointment only, within 1 month after your final class. We reserve the right to dispose of uncollected pieces after 3 months. Please contact us to arrange collection.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>General</h2>
        <p>We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.</p>
      </div>

      <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '13px', color: MUTED }}>
        <p><a href="https://www.ves.sg" style={{ color: TC, textDecoration: 'none' }}>ves.sg</a> &middot; <a href="https://www.instagram.com/ves.studio/" style={{ color: TC, textDecoration: 'none' }}>Instagram</a> &middot; <a href="https://www.facebook.com/ves.studio.sg/" style={{ color: TC, textDecoration: 'none' }}>Facebook</a></p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Policies route and PolicyPopup to App.jsx**

In `frontend/src/App.jsx`:

Add import at top (with the other lazy imports or direct imports):
```javascript
import Policies from './pages/Policies';
import PolicyPopup from './components/PolicyPopup';
```

Add the public `/policies` route. In the routes section (around line 155), add before the student routes:
```javascript
          <Route path="/policies" element={<Policies />} />
```

- [ ] **Step 3: Add policy gate to PrivateRoute**

Modify `PrivateRoute` (lines 62-75) to show the policy popup when `policiesAcceptedAt` is null:

```javascript
function PrivateRoute({ children }) {
  const { user, loading, refreshUser } = useAuth();
  const [policiesJustAccepted, setPoliciesJustAccepted] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;

  // Show policy popup for users who haven't accepted yet
  if (!user.policiesAcceptedAt && !policiesJustAccepted) {
    return (
      <>
        {children}
        <PolicyPopup onAccepted={() => {
          setPoliciesJustAccepted(true);
          if (refreshUser) refreshUser();
        }} />
      </>
    );
  }

  return children;
}
```

Add `useState` to the imports at the top of App.jsx if not already imported.

- [ ] **Step 4: Ensure useAuth exposes refreshUser**

In `frontend/src/hooks/useAuth.jsx`, ensure `fetchUser` is exposed in the context value (it may already be). If the context value object doesn't include a `refreshUser` function, add it:

```javascript
// In the context provider value, add:
refreshUser: () => fetchUser({ skipCache: true }),
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Policies.jsx frontend/src/App.jsx frontend/src/hooks/useAuth.jsx
git commit -m "feat: add policies page, policy popup gate on first login"
```

---

### Task 14: Create Admin Course Emails Page

**Files:**
- Create: `frontend/src/pages/AdminCourseEmails.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AdminNav.jsx`

- [ ] **Step 1: Create `frontend/src/pages/AdminCourseEmails.jsx`**

```jsx
import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

export default function AdminCourseEmails() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    try {
      const { data } = await api.get('/admin/course-emails');
      setCourses(data.courses || []);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDraft = async (courseId) => {
    setDraftLoading(true);
    setSelectedCourse(courseId);
    try {
      const { data } = await api.get(`/admin/course-emails/${courseId}/draft`);
      setDraft(data);
    } catch (err) {
      console.error('Failed to load draft:', err);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft) return;
    setSending(true);
    try {
      const recipientEmails = draft.students.filter(s => s.selected).map(s => s.email);
      await api.post(`/admin/course-emails/${selectedCourse}/send`, {
        templateType: draft.templateType,
        dayOfWeek: draft.dayOfWeek,
        startDate: draft.startDate,
        endDate: draft.endDate,
        timeSlot: draft.timeSlot,
        holidayExclusions: draft.holidayExclusions,
        specialNotes: draft.specialNotes,
        collectionStart: draft.collectionStart,
        collectionEnd: draft.collectionEnd,
        disposalDate: draft.disposalDate,
        recipientEmails,
      });
      alert(`Email sent to ${recipientEmails.length} students!`);
      setDraft(null);
      setSelectedCourse(null);
      fetchCourses();
    } catch (err) {
      alert('Failed to send email: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/admin/course-emails/history');
      setHistory(data.emails || []);
      setShowHistory(true);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const toggleStudent = (idx) => {
    setDraft(prev => {
      const students = [...prev.students];
      students[idx] = { ...students[idx], selected: !students[idx].selected };
      return { ...prev, students };
    });
  };

  const updateDraftField = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div>;

  // Draft editor view
  if (draft && selectedCourse) {
    const selectedCount = draft.students.filter(s => s.selected).length;

    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
        <button onClick={() => { setDraft(null); setSelectedCourse(null); }} style={{ background: 'none', border: 'none', color: TC, cursor: 'pointer', fontSize: '13px', marginBottom: '16px' }}>
          &larr; Back to courses
        </button>

        <h2 style={{ fontSize: '18px', fontWeight: 600, color: INK, margin: '0 0 4px' }}>
          Course Email: {selectedCourse}
        </h2>
        <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 20px' }}>Template: {draft.templateType}</p>

        {/* Editable Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Holiday Exclusions
            <input
              type="text"
              value={draft.holidayExclusions}
              onChange={e => updateDraftField('holidayExclusions', e.target.value)}
              placeholder="e.g. NO CLASS 18 APR GOOD FRIDAY"
              style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Special Notes
            <textarea
              value={draft.specialNotes}
              onChange={e => updateDraftField('specialNotes', e.target.value)}
              placeholder="Any additional notes for students..."
              rows={3}
              style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Collection Start
              <input type="text" value={draft.collectionStart} onChange={e => updateDraftField('collectionStart', e.target.value)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Collection End
              <input type="text" value={draft.collectionEnd} onChange={e => updateDraftField('collectionEnd', e.target.value)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Disposal After
              <input type="text" value={draft.disposalDate} onChange={e => updateDraftField('disposalDate', e.target.value)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }} />
            </label>
          </div>
        </div>

        {/* Student List */}
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: INK, margin: '0 0 8px' }}>
          Recipients ({selectedCount}/{draft.students.length})
        </h3>
        <div style={{ border: `1px solid ${RULE}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
          {draft.students.map((s, i) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
              borderBottom: i < draft.students.length - 1 ? `1px solid ${RULE}` : 'none',
              backgroundColor: s.selected ? '#fff' : '#f9f9f9',
            }}>
              <input type="checkbox" checked={s.selected} onChange={() => toggleStudent(i)} style={{ accentColor: TC }} />
              <span style={{ fontSize: '14px', color: s.selected ? INK : MUTED }}>
                {s.firstName} {s.lastName}
              </span>
              <span style={{ fontSize: '12px', color: MUTED, marginLeft: 'auto' }}>{s.email}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSend}
            disabled={sending || selectedCount === 0}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
              backgroundColor: selectedCount > 0 ? TC : '#ccc', color: '#fff',
              fontSize: '14px', fontWeight: 600, cursor: selectedCount > 0 ? 'pointer' : 'default',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? 'Sending...' : `Send to ${selectedCount} student${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    );
  }

  // History view
  if (showHistory) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
        <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: TC, cursor: 'pointer', fontSize: '13px', marginBottom: '16px' }}>
          &larr; Back to courses
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: INK, margin: '0 0 16px' }}>Email History</h2>
        {history.length === 0 ? (
          <p style={{ color: MUTED }}>No emails sent yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map(email => (
              <div key={email.id} style={{ padding: '12px 16px', border: `1px solid ${RULE}`, borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{email.subject}</span>
                  <span style={{ fontSize: '12px', color: MUTED }}>{new Date(email.sent_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '12px', color: MUTED }}>
                  {email.email_type} &middot; {email.recipient_count} recipients &middot; Sent by {email.sent_by}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Course list view
  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: INK, margin: 0 }}>Course Emails</h2>
        <button onClick={loadHistory} style={{ background: 'none', border: `1px solid ${RULE}`, borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: MUTED, cursor: 'pointer' }}>
          History
        </button>
      </div>

      {courses.length === 0 ? (
        <p style={{ color: MUTED, textAlign: 'center', padding: '40px 0' }}>No upcoming courses in the next 14 days.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {courses.map(course => (
            <div key={course.courseIdentifier} style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px',
              border: `1px solid ${RULE}`, borderRadius: '8px',
              backgroundColor: course.emailSentAt ? '#f0fdf0' : '#fff',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{course.courseIdentifier}</div>
                <div style={{ fontSize: '12px', color: MUTED }}>
                  {course.courseType} &middot; {course.startDate} &middot; {course.timeSlot} &middot; {course.studentCount} students
                </div>
              </div>
              {course.emailSentAt ? (
                <span style={{ fontSize: '11px', color: '#1E6B1E', fontWeight: 600 }}>
                  Sent {new Date(course.emailSentAt).toLocaleDateString()}
                </span>
              ) : (
                <button
                  onClick={() => loadDraft(course.courseIdentifier)}
                  disabled={draftLoading}
                  style={{
                    padding: '6px 16px', borderRadius: '6px', border: 'none',
                    backgroundColor: TC, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Compose
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add admin route in App.jsx**

In `frontend/src/App.jsx`, add import:
```javascript
const AdminCourseEmails = lazy(() => import('./pages/AdminCourseEmails'));
```

Add route inside the admin routes block (after the `studio-access` route, around line 187):
```javascript
            <Route path="emails" element={<AdminCourseEmails />} />
```

- [ ] **Step 3: Add "Emails" link to AdminNav**

In `frontend/src/components/AdminNav.jsx`, modify the `NAV_LINKS` array at line 9-13:

```javascript
const NAV_LINKS = [
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Users',     href: '/admin/students' },
  { id: 'emails',      label: 'Emails',    href: '/admin/emails' },
  { id: 'studio-access', label: 'Studio',  href: '/admin/studio-access' },
];
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdminCourseEmails.jsx frontend/src/App.jsx frontend/src/components/AdminNav.jsx
git commit -m "feat: add admin course emails page with draft editor, send, and history"
```

---

### Task 15: Test End-to-End

- [ ] **Step 1: Start dev servers**

```bash
cd server && npm run dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Test email service manually**

Create a quick test script `server/test-email.js`:

```javascript
require('dotenv').config();
const { sendEmail } = require('./utils/emailService');
const { generateCohortConfirmedEmail } = require('./email-templates/cohort-confirmed');

(async () => {
  const { subject, html } = generateCohortConfirmedEmail({
    courseType: 'Wheelthrowing',
    dayOfWeek: 'Friday',
    startDate: '14 March 2025',
    endDate: '25 April 2025',
    timeSlot: '9:30am - 12:00pm',
  });

  const result = await sendEmail({ to: 'info@ves.sg', subject, html });
  console.log('Result:', result);
})();
```

Run: `cd server && node test-email.js`

Expected: Email received at info@ves.sg with VES branding.

- [ ] **Step 3: Test admin course emails page**

1. Navigate to `http://localhost:5173/admin/emails`
2. Verify courses list loads
3. Click "Compose" on a course
4. Verify draft populates with dates, students, auto-calculated collection dates
5. Edit holiday exclusions field
6. Click "Send" → verify email arrives at info@ves.sg (BCC'd to students)
7. Verify "History" shows the sent record

- [ ] **Step 4: Test policy popup**

1. In Supabase, set `policies_accepted_at = NULL` for a test user
2. Login as that user
3. Verify popup appears and cannot be dismissed
4. Check the checkbox and click "Continue"
5. Verify popup disappears and doesn't appear on next page load

- [ ] **Step 5: Test /policies page**

Navigate to `http://localhost:5173/policies` while logged out. Verify it loads with full policy content.

- [ ] **Step 6: Clean up test script and commit**

```bash
rm server/test-email.js
git add -A
git commit -m "test: verify email system end-to-end, cleanup test script"
```
