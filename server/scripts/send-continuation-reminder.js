// One-off: email a pending continuation offer by hand, for the two students the
// 19/08 sweep offered and then went quiet on. Autosend is off, so the offer rows
// exist and their links are live but nobody was written to.
//
// Two different letters, because the two students are in different places:
//   offer 27 (Ignacius) — never answered either offer. A chase.
//   offer 26 (April)    — asked for more days from her own dashboard on 23/08.
//                         An acknowledgement, NOT a chase.
//
// Usage from server/:
//   node scripts/send-continuation-reminder.js 27           # dry run, prints + writes preview
//   node scripts/send-continuation-reminder.js 27 --send    # actually sends, stamps sent_at
require('dotenv').config();
const fs = require('fs');
const { supabase } = require('../utils/supabaseDb');
const { publicBaseUrl } = require('../utils/publicUrl');
const { wrapEmailTemplate, esc, escUrl } = require('../email-templates/base');

const OFFER_ID = parseInt(process.argv[2], 10);
const DO_SEND = process.argv.includes('--send');
const PREVIEW_DIR = '/private/tmp/claude-501/-Users-justinlong-Documents-U----U-ves-code-pottery-gallery-app/339ca43b-074e-4805-8c87-a1427eda8846/scratchpad';

if (![26, 27].includes(OFFER_ID)) {
  console.error('Usage: node scripts/send-continuation-reminder.js <26|27> [--send]');
  process.exit(1);
}

const fmtDate = d => new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`)
  .toLocaleDateString('en-SG', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Singapore' });
const fmtDeadline = iso => new Date(iso)
  .toLocaleDateString('en-SG', { weekday:'long', day:'numeric', month:'long', timeZone:'Asia/Singapore' });
const shortDate = d => new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`)
  .toLocaleDateString('en-SG', { day:'numeric', month:'long', timeZone:'Asia/Singapore' });

// The paragraphs that differ between the two. Everything else is shared.
const LETTERS = {
  27: {
    subject: o => `Your next course starts ${shortDate(o.first_class_date)} — still time to confirm`,
    opening: (o, day) => `
      We wrote last week about your next wheelthrowing course and have not heard back, so
      here is a fresh link — the one in that note has expired. This would be course 2 of
      your 3, and your usual ${esc(day)} slot is still open:`,
    deadline: o => `
      Your last class of this course is on Thursday 27 August — have a think, and let us
      know by <strong>${fmtDeadline(o.expires_at)}</strong>. After that we release the
      place to the next person on the list.`,
    footnote: `
      Not the right time? The same link lets you pass on this one or ask for a few
      more days to decide — your remaining courses do not expire.`,
  },
  26: {
    subject: o => `Your place on the ${shortDate(o.first_class_date)} course is held`,
    opening: (o, day) => `
      Thanks for letting us know you needed a few more days — your place is still held.
      This is the last of your three courses, in your usual ${esc(day)} slot:`,
    deadline: o => `
      The extra time you asked for runs to <strong>${fmtDeadline(o.expires_at)}</strong>.
      One tap either way whenever you have decided.`,
    // She has no courses left after this one, so the standard "your remaining
    // courses do not expire" line would be untrue. Passing forfeits the cohort,
    // never the course itself — that is what she keeps.
    footnote: `
      If it turns out not to be the right time, the same link lets you pass on this
      one — the course stays yours for a later cohort.`,
  },
};

(async () => {
  const { data: offer, error } = await supabase
    .from('continuation_offers')
    .select('*, customers!continuation_offers_student_id_fkey(first_name, email)')
    .eq('id', OFFER_ID)
    .single();
  if (error) throw error;

  if (offer.status !== 'pending') {
    console.error(`offer ${OFFER_ID} is "${offer.status}", not pending — nothing sent.`);
    process.exit(1);
  }
  if (offer.sent_at) {
    console.error(`offer ${OFFER_ID} was already emailed at ${offer.sent_at} — nothing sent.`);
    process.exit(1);
  }

  const letter = LETTERS[OFFER_ID];
  const day = offer.schedule_pattern.charAt(0) + offer.schedule_pattern.slice(1).toLowerCase();
  const offerUrl = `${publicBaseUrl()}/continue/${offer.token}`;
  const subject = letter.subject(offer);
  const P = 'margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;';

  const html = wrapEmailTemplate(`
    <p style="${P}">Hi ${esc(offer.customers.first_name)},</p>

    <p style="${P}">${letter.opening(offer, day)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px; background-color: #F9EDE6; border-radius: 8px;">
      <tr>
        <td style="padding: 18px 20px;">
          <div style="font-size: 16px; font-weight: 700; color: #282828;">${fmtDate(offer.first_class_date)}</div>
          <div style="font-size: 14px; color: #9E4A1E; margin-top: 4px;">${esc(offer.class_time)} &middot; 6 weeks</div>
        </td>
      </tr>
    </table>

    <p style="${P}">${letter.deadline(offer)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${escUrl(offerUrl)}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Confirm your place
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.7; color: #888888;">${letter.footnote}</p>
  `);

  const preview = `${PREVIEW_DIR}/reminder-offer-${OFFER_ID}.html`;
  fs.writeFileSync(preview, html);
  console.log(`offer ${OFFER_ID} | ${offer.customers.first_name} <${offer.customers.email}> | expires ${fmtDeadline(offer.expires_at)}`);
  console.log(`SUBJECT: ${subject}`);
  console.log(`URL:     ${offerUrl}`);
  console.log(`preview: ${preview}`);

  if (!DO_SEND) return console.log('\n(dry run — pass --send to actually send)');

  const { sendEmail } = require('../utils/emailService');
  const result = await sendEmail({ to: offer.customers.email, subject, html });
  console.log('send result:', JSON.stringify(result));
  if (result.success) {
    await supabase.from('continuation_offers')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', OFFER_ID);
    console.log(`sent_at stamped on offer ${OFFER_ID}`);
  }
})();
