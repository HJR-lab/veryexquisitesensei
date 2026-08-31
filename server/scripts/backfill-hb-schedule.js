// Fill the handbuilding calendar forward. Run from server/:
//
//   node scripts/backfill-hb-schedule.js                  # dry run to the default horizon
//   node scripts/backfill-hb-schedule.js --until 2026-12-31 --write
//
// The HB drop-in calendar was hand-filled in bulk batches from January 2026 and
// the last one ran out on 2026-08-31, leaving 48 open enrolments holding 165
// unspent credits with nothing to book. utils/hbScheduleGenerator.js now keeps
// it topped up on boot and nightly; this script is the manual handle on the
// same code, for backfilling a gap or extending past the rolling horizon.
//
// Dry run by default — it prints exactly what it would create and writes
// nothing until you pass --write.

require('dotenv').config();
const { planHbTopUp, topUpHbSchedule } = require('../utils/hbScheduleGenerator');
const { HB_SLOTS } = require('../config/hbSchedule');
const { weekdayName } = require('../utils/sgtDate');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const write = process.argv.includes('--write');
  const options = {};
  if (arg('--from')) options.from = arg('--from');
  if (arg('--until')) options.until = arg('--until');
  if (arg('--horizon-days')) options.horizonDays = Number(arg('--horizon-days'));

  const { from, until, missing, existing } = await planHbTopUp(options);

  console.log(`\nHandbuilding calendar, ${from} to ${until}`);
  console.log(`  timetable: ${HB_SLOTS.map(s => `${s.weekday.slice(0, 3)} ${s.startTime}`).join(', ')}`);
  console.log(`  already scheduled: ${existing}`);
  console.log(`  missing: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('Nothing to do — the calendar is already filled to that date.');
    return;
  }

  const byType = {};
  for (const m of missing) byType[m.class_type] = (byType[m.class_type] || 0) + 1;
  for (const [type, n] of Object.entries(byType)) console.log(`  ${type.padEnd(14)} ${n}`);

  console.log(`\n  first: ${missing[0].class_date} (${weekdayName(missing[0].class_date)}) ${missing[0].class_type}`);
  const last = missing[missing.length - 1];
  console.log(`  last:  ${last.class_date} (${weekdayName(last.class_date)}) ${last.class_type}`);

  if (!write) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to create these.');
    return;
  }

  const result = await topUpHbSchedule(options);
  console.log(`\nCreated ${result.created} class instances and synced them to the studio calendar.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
