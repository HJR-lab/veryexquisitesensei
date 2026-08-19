// Render the four uncollected-pieces emails to HTML files so they can be read
// before anything is sent, and report which batches the new milestone schedule
// would pick up right now. Sends nothing, writes nothing to the database.
//
// Run from server/:  node scripts/preview-piece-emails.js [outDir]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabaseDb = require('../utils/supabaseDb');

const outDir = process.argv[2] || path.join(__dirname, '..', '..', 'tmp-email-preview');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  // Preview against a real batch so the copy is shown with real numbers.
  const batch = await supabaseDb.getPieceBatchById(38);
  const student = batch.customers;
  const courseName = batch.course_enrollments?.course_title
    || batch.course_enrollments?.course_variant_title
    || 'your course';
  const photoUrl = batch.photo_urls?.[0] || null;
  const appUrl = 'https://club.ves.sg';
  const common = {
    studentName: student?.first_name || 'there',
    courseName,
    pieceCount: batch.piece_count,
    photoUrl,
    appUrl,
  };

  const holdDays = supabaseDb.PIECE_HOLD_DAYS;
  const readyAt = new Date(batch.ready_at);
  const holdExpiresDate = new Date(readyAt.getTime() + holdDays * 86400000)
    .toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

  const renders = [
    ['1-ready', require('../email-templates/pieces/pieces-ready').generate(common)],
    ...supabaseDb.PIECE_REMINDER_DAYS.map((d, i) => [
      `${i + 2}-reminder-day-${d}`,
      require('../email-templates/pieces/pieces-reminder').generate({
        ...common, daysSinceReady: d, holdExpiresDate, holdDays,
      }),
    ]),
    ['5-recycled', require('../email-templates/pieces/pieces-recycled').generate(common)],
  ];

  for (const [name, { subject, html }] of renders) {
    const file = path.join(outDir, `${name}.html`);
    fs.writeFileSync(file, html);
    console.log(`${name.padEnd(20)} SUBJECT: ${subject}\n${' '.repeat(20)} ${file}`);
  }

  console.log(`\nHold: ${holdDays} days. Reminders at day ${supabaseDb.PIECE_REMINDER_DAYS.join(', ')}.`);

  const due = await supabaseDb.getReadyBatchesNeedingReminder();
  console.log(`\nBatches the schedule would remind right now: ${due.length}`);
  for (const b of due) {
    const days = Math.floor((Date.now() - new Date(b.ready_at)) / 86400000);
    console.log(`  batch ${b.id} — ${b.initials}, ${b.piece_count} pcs, ready ${days}d ago, ${b.customers?.email}`);
  }

  const expired = await supabaseDb.getExpiredPieceBatches();
  console.log(`\nBatches past the ${holdDays}-day hold (would be recycled): ${expired.length}`);
  for (const b of expired) console.log(`  batch ${b.id} — ${b.initials}, ${b.customers?.email}`);
})().catch((e) => {
  console.error('Preview failed:', e.message);
  process.exit(1);
});
