// Repair course_start_date / course_end_date drift.
//
//   DRY RUN (default):  node scripts/repair-cohort-start-dates.js
//   APPLY:              node scripts/repair-cohort-start-dates.js --apply
//   UNDO:               node scripts/repair-cohort-start-dates.js --undo <backup.json>
//
// WHY
// courseEnrollmentManager stored these with `.toISOString().split('T')[0]` on
// an SGT-midnight instant, which lands on 16:00 UTC the day before. Every
// cohort parsed from a variant title was written one day early, in every
// timezone, since Feb 2026.
//
// WHAT IS SAFE HERE
// course_start_date is the cohort MATCHING KEY: enrollments are grouped by
// (course_start_date, schedule_pattern, class_time). Every row in a cohort
// carries the same wrong value, so grouping works today. This script moves an
// ENTIRE cohort at once, so grouping keeps working — it never shifts one row
// and leaves its peers behind.
//
// Truth comes from class_instances, which were always correct. A cohort with no
// class instances is left alone rather than guessed at.
//
// continuation_offers.cohort_start_date is a copy of the same key and is moved
// in the same pass, or a pending offer would stop matching its cohort.
//
// Writes a timestamped backup of every prior value BEFORE applying, and can
// restore from it. Idempotent: re-running finds nothing to do.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../utils/supabaseDb');
const { toYmd, weekdayName, isWeekday, daysUntilWeekday, addDays } = require('../utils/sgtDate');

const APPLY = process.argv.includes('--apply');
const UNDO_IDX = process.argv.indexOf('--undo');
const BACKUP_DIR = path.join(__dirname, '..', '.date-repair-backups');

async function undo(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Restoring ${backup.enrollments.length} enrollment(s) and ${backup.offers.length} offer(s) from ${path.basename(file)}\n`);
  for (const row of backup.enrollments) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({ course_start_date: row.course_start_date, course_end_date: row.course_end_date })
      .eq('id', row.id);
    console.log(`  ${error ? 'FAIL' : 'ok  '}  enrollment ${row.id} → ${row.course_start_date}`);
  }
  for (const row of backup.offers) {
    const { error } = await supabase
      .from('continuation_offers')
      .update({ cohort_start_date: row.cohort_start_date })
      .eq('id', row.id);
    console.log(`  ${error ? 'FAIL' : 'ok  '}  offer ${row.id} → ${row.cohort_start_date}`);
  }
  console.log('\nRestored.');
}

/** The cohort's true start: its first class instance. Null if it has none. */
async function trueStartDate(courseIdentifier) {
  const base = String(courseIdentifier || '').split('.')[0];
  if (!base) return null;
  const { data } = await supabase
    .from('class_instances')
    .select('class_date')
    .like('class_type', `${base}.%`)
    .order('class_date', { ascending: true })
    .limit(1);
  return data?.[0] ? toYmd(data[0].class_date) : null;
}

/** The cohort's true end: its last class instance. */
async function trueEndDate(courseIdentifier) {
  const base = String(courseIdentifier || '').split('.')[0];
  if (!base) return null;
  const { data } = await supabase
    .from('class_instances')
    .select('class_date')
    .like('class_type', `${base}.%`)
    .order('class_date', { ascending: false })
    .limit(1);
  return data?.[0] ? toYmd(data[0].class_date) : null;
}

async function main() {
  if (UNDO_IDX !== -1) return undo(process.argv[UNDO_IDX + 1]);

  console.log(APPLY ? '*** APPLY MODE — this will write ***\n' : 'DRY RUN — nothing will be written. Add --apply to commit.\n');

  // Only forward-looking cohorts. Past ones are history; rewriting them buys
  // nothing and risks disturbing completed records.
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_start_date, course_end_date, schedule_pattern, class_time, status')
    .gte('course_start_date', today)
    .not('schedule_pattern', 'is', null)
    .neq('status', 'cancelled');
  if (error) throw error;

  // Group by the cohort key so a cohort moves as one unit.
  const cohorts = new Map();
  for (const e of enrollments || []) {
    const key = `${toYmd(e.course_start_date)}|${e.schedule_pattern}|${e.class_time}`;
    if (!cohorts.has(key)) cohorts.set(key, { key, rows: [], sample: e });
    cohorts.get(key).rows.push(e);
  }

  const plan = [];
  for (const c of cohorts.values()) {
    const stored = toYmd(c.sample.course_start_date);
    const identifier = (c.sample.course_identifier || '').split('.')[0];

    let correct = await trueStartDate(identifier);
    let source = 'class_instances';
    if (!correct) {
      // No classes created yet: the only other evidence is the cohort's own
      // stated weekday. Roll forward to it.
      const delta = daysUntilWeekday(stored, c.sample.schedule_pattern);
      if (delta === 0) continue; // already consistent, nothing to do
      correct = addDays(stored, delta);
      source = 'weekday rollforward';
    }
    if (!correct || correct === stored) continue;

    // Refuse to write a date that still contradicts the cohort's weekday.
    if (!isWeekday(correct, c.sample.schedule_pattern)) {
      console.log(`  SKIP  ${identifier || c.key}: computed ${correct} is a ${weekdayName(correct)}, not ${c.sample.schedule_pattern}. Left alone.`);
      continue;
    }

    const correctEnd = (await trueEndDate(identifier)) || null;
    plan.push({ cohort: c, identifier, stored, correct, correctEnd, source });
  }

  if (plan.length === 0) {
    console.log('Nothing to repair — every upcoming cohort already agrees with its class instances.');
    return;
  }

  console.log('Planned changes:\n');
  let rowCount = 0;
  for (const p of plan) {
    console.log(`  ${(p.identifier || p.cohort.key).padEnd(16)} ${p.stored} (${weekdayName(p.stored)}) → ${p.correct} (${weekdayName(p.correct)})`);
    console.log(`    ${p.cohort.rows.length} enrollment(s): ${p.cohort.rows.map(r => r.id).join(', ')}`);
    if (p.correctEnd) console.log(`    end date → ${p.correctEnd}`);
    console.log(`    source: ${p.source}`);
    rowCount += p.cohort.rows.length;
  }

  // Pending offers carry a copy of the same key.
  const { data: offers } = await supabase
    .from('continuation_offers')
    .select('id, cohort_start_date, schedule_pattern, class_time, status');
  const offerMoves = [];
  for (const o of offers || []) {
    const hit = plan.find(p =>
      toYmd(o.cohort_start_date) === p.stored &&
      o.schedule_pattern === p.cohort.sample.schedule_pattern &&
      o.class_time === p.cohort.sample.class_time);
    if (hit) offerMoves.push({ id: o.id, from: toYmd(o.cohort_start_date), to: hit.correct });
  }
  if (offerMoves.length) {
    console.log(`\n  continuation_offers to move with them: ${offerMoves.map(o => `#${o.id} ${o.from}→${o.to}`).join(', ')}`);
  }

  console.log(`\n${plan.length} cohort(s), ${rowCount} enrollment(s), ${offerMoves.length} offer(s).`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  // Backup BEFORE writing.
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `cohort-dates-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    createdAt: new Date().toISOString(),
    enrollments: plan.flatMap(p => p.cohort.rows.map(r => ({
      id: r.id, course_start_date: toYmd(r.course_start_date), course_end_date: toYmd(r.course_end_date),
    }))),
    offers: offerMoves.map(o => ({ id: o.id, cohort_start_date: o.from })),
  }, null, 2));
  console.log(`\nBackup written: ${backupFile}`);
  console.log(`Undo with: node scripts/repair-cohort-start-dates.js --undo ${backupFile}\n`);

  for (const p of plan) {
    const ids = p.cohort.rows.map(r => r.id);
    const update = { course_start_date: p.correct, updated_at: new Date().toISOString() };
    if (p.correctEnd) update.course_end_date = p.correctEnd;
    const { error: uErr } = await supabase.from('course_enrollments').update(update).in('id', ids);
    console.log(`  ${uErr ? `FAIL ${uErr.message}` : 'ok  '}  ${p.identifier}: ${ids.length} enrollment(s) → ${p.correct}`);
  }
  for (const o of offerMoves) {
    const { error: oErr } = await supabase
      .from('continuation_offers').update({ cohort_start_date: o.to }).eq('id', o.id);
    console.log(`  ${oErr ? `FAIL ${oErr.message}` : 'ok  '}  offer #${o.id} → ${o.to}`);
  }

  console.log('\nApplied. Re-run without --apply to confirm nothing is left.');
}

main().catch(err => { console.error('repair failed:', err.message); process.exit(1); });
