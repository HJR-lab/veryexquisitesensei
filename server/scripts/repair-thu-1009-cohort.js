// Put the Thursday 10 Sep buyers back in the Thursday 10 Sep cohort.
//
//   DRY RUN (default):  node scripts/repair-thu-1009-cohort.js
//   APPLY:              node scripts/repair-thu-1009-cohort.js --apply
//   UNDO:               node scripts/repair-thu-1009-cohort.js --undo <backup.json>
//
// WHY
// Doreen (enrollment 5458) was deliberately moved to the Tuesday 8 Sep cohort,
// which rewrote her course_identifier to WT0809NT_JL6 — but left her cohort KEY
// (schedule_pattern THURSDAY + course_start_date 2026-09-10) pointing at Thursday.
// checkAndProcessThreshold groups by that key and then copies whichever peer
// already has bookings, so every later Thursday buyer was booked into her
// Tuesday classes: Ignacius Tay (5487) and Mackenzie Aisha Koh (5488).
//
// WHAT THIS DOES
//   1. Moves the two mis-placed enrollments' bookings from the Tuesday instances
//      to the Thursday instances of the same week, keeping the booking rows (and
//      therefore their history) intact.
//   2. Repoints those enrollments' course_identifier at WT1009NT_JL6.
//   3. Realigns Doreen's cohort key to the Tuesday cohort she actually attends,
//      so she can never again be picked as a Thursday peer. Her purchase record
//      (course_variant_title) is left untouched — that is what she bought.
//   4. Recomputes current_enrollment on every touched instance from real bookings.
//
// Backs up every prior value BEFORE applying, and can restore from it.
// Idempotent: re-running finds nothing to do.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');
const UNDO_IDX = process.argv.indexOf('--undo');
const BACKUP_DIR = path.join(__dirname, '..', '.date-repair-backups');

const WRONG_BASE = 'WT0809NT_JL6';   // Tuesday 8 Sep
const RIGHT_BASE = 'WT1009NT_JL6';   // Thursday 10 Sep
const MOVE_ENROLLMENTS = [5487, 5488];
const DOREEN = {
  id: 5458,
  course_start_date: '2026-09-08',
  course_end_date: '2026-10-13',
  schedule_pattern: 'TUESDAY',
};

async function instancesFor(base) {
  const { data, error } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, status, current_enrollment')
    .like('class_type', `${base}.%`)
    .order('class_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

const weekOf = classType => Number(String(classType).split('.').pop());

async function recountEnrollment(instanceId) {
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', instanceId)
    .eq('status', 'booked');
  return count || 0;
}

async function undo(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Restoring ${backup.bookings.length} booking(s) and ${backup.enrollments.length} enrollment(s) from ${path.basename(file)}\n`);
  for (const b of backup.bookings) {
    const { error } = await supabase
      .from('bookings')
      .update({ class_instance_id: b.class_instance_id })
      .eq('id', b.id);
    console.log(`  ${error ? 'FAIL' : 'ok  '}  booking ${b.id} → instance ${b.class_instance_id}`);
  }
  for (const e of backup.enrollments) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({
        course_identifier: e.course_identifier,
        course_start_date: e.course_start_date,
        course_end_date: e.course_end_date,
        schedule_pattern: e.schedule_pattern,
      })
      .eq('id', e.id);
    console.log(`  ${error ? 'FAIL' : 'ok  '}  enrollment ${e.id} → ${e.course_identifier} / ${e.schedule_pattern} ${e.course_start_date}`);
  }
  for (const c of backup.instances) {
    await supabase.from('class_instances').update({ current_enrollment: c.current_enrollment }).eq('id', c.id);
  }
  console.log('\nRestored.');
}

async function main() {
  if (UNDO_IDX !== -1) return undo(process.argv[UNDO_IDX + 1]);

  console.log(APPLY ? '*** APPLY MODE — this will write ***\n' : 'DRY RUN — nothing will be written. Add --apply to commit.\n');

  const wrong = await instancesFor(WRONG_BASE);
  const right = await instancesFor(RIGHT_BASE);
  if (wrong.length === 0 || right.length === 0) throw new Error('Could not load both cohorts');

  // Week number → target instance. Same 6-week shape, so week N maps to week N.
  const targetByWeek = new Map(right.map(ci => [weekOf(ci.class_type), ci]));
  const wrongById = new Map(wrong.map(ci => [ci.id, ci]));

  const bookingMoves = [];
  const enrollmentBackup = [];

  for (const enrollmentId of MOVE_ENROLLMENTS) {
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('id, student_id, course_identifier, course_start_date, course_end_date, schedule_pattern, course_variant_title')
      .eq('id', enrollmentId)
      .single();
    const { data: customer } = await supabase
      .from('customers').select('first_name, last_name').eq('id', enrollment.student_id).maybeSingle();
    const who = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, class_instance_id, status')
      .eq('course_enrollment_id', enrollmentId)
      .order('class_instance_id');

    console.log(`ENR ${enrollmentId} — ${who} (${enrollment.course_variant_title})`);
    for (const b of bookings || []) {
      const from = wrongById.get(b.class_instance_id);
      if (!from) {
        console.log(`  keep  booking ${b.id} on instance ${b.class_instance_id} (not in ${WRONG_BASE})`);
        continue;
      }
      const to = targetByWeek.get(weekOf(from.class_type));
      if (!to) {
        console.log(`  SKIP  booking ${b.id}: no ${RIGHT_BASE} week ${weekOf(from.class_type)}`);
        continue;
      }
      console.log(`  move  booking ${b.id}: ${from.class_type} ${String(from.class_date).slice(0, 10)} → ${to.class_type} ${String(to.class_date).slice(0, 10)}`);
      bookingMoves.push({ id: b.id, from: from.id, to: to.id });
    }

    if (enrollment.course_identifier !== RIGHT_BASE) {
      console.log(`  ident ${enrollment.course_identifier} → ${RIGHT_BASE}`);
      enrollmentBackup.push({ ...enrollment, _newIdentifier: RIGHT_BASE });
    }
    console.log('');
  }

  // Doreen: keep her Tuesday bookings, move her cohort KEY to match them.
  const { data: doreen } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_start_date, course_end_date, schedule_pattern')
    .eq('id', DOREEN.id)
    .single();
  const doreenNeedsKey =
    String(doreen.course_start_date).slice(0, 10) !== DOREEN.course_start_date ||
    doreen.schedule_pattern !== DOREEN.schedule_pattern;
  if (doreenNeedsKey) {
    console.log(`ENR ${DOREEN.id} — Doreen Siow (stays on Tuesday, key realigned)`);
    console.log(`  key   ${doreen.schedule_pattern} ${String(doreen.course_start_date).slice(0, 10)}–${String(doreen.course_end_date).slice(0, 10)} → ${DOREEN.schedule_pattern} ${DOREEN.course_start_date}–${DOREEN.course_end_date}\n`);
  }

  const touchedInstances = [...new Set(bookingMoves.flatMap(m => [m.from, m.to]))];

  if (bookingMoves.length === 0 && enrollmentBackup.length === 0 && !doreenNeedsKey) {
    console.log('Nothing to do.');
    return;
  }

  if (!APPLY) {
    console.log(`Would move ${bookingMoves.length} booking(s), update ${enrollmentBackup.length + (doreenNeedsKey ? 1 : 0)} enrollment(s), recount ${touchedInstances.length} instance(s).`);
    return;
  }

  // Backup first.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `thu-1009-cohort-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const { data: instanceState } = await supabase
    .from('class_instances').select('id, current_enrollment').in('id', touchedInstances.length ? touchedInstances : [0]);
  fs.writeFileSync(backupFile, JSON.stringify({
    bookings: bookingMoves.map(m => ({ id: m.id, class_instance_id: m.from })),
    enrollments: [
      ...enrollmentBackup.map(e => ({
        id: e.id,
        course_identifier: e.course_identifier,
        course_start_date: e.course_start_date,
        course_end_date: e.course_end_date,
        schedule_pattern: e.schedule_pattern,
      })),
      ...(doreenNeedsKey ? [{
        id: doreen.id,
        course_identifier: doreen.course_identifier,
        course_start_date: doreen.course_start_date,
        course_end_date: doreen.course_end_date,
        schedule_pattern: doreen.schedule_pattern,
      }] : []),
    ],
    instances: instanceState || [],
  }, null, 2));
  console.log(`Backup written to ${backupFile}\n`);

  const now = new Date().toISOString();

  for (const m of bookingMoves) {
    const { error } = await supabase
      .from('bookings')
      .update({ class_instance_id: m.to, updated_at: now })
      .eq('id', m.id);
    console.log(`  ${error ? 'FAIL ' + error.message : 'ok  '}  booking ${m.id} → instance ${m.to}`);
  }

  for (const e of enrollmentBackup) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({ course_identifier: e._newIdentifier, updated_at: now })
      .eq('id', e.id);
    console.log(`  ${error ? 'FAIL ' + error.message : 'ok  '}  enrollment ${e.id} identifier → ${e._newIdentifier}`);
  }

  if (doreenNeedsKey) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({
        course_start_date: DOREEN.course_start_date,
        course_end_date: DOREEN.course_end_date,
        schedule_pattern: DOREEN.schedule_pattern,
        updated_at: now,
      })
      .eq('id', DOREEN.id);
    console.log(`  ${error ? 'FAIL ' + error.message : 'ok  '}  enrollment ${DOREEN.id} key → ${DOREEN.schedule_pattern} ${DOREEN.course_start_date}`);
  }

  for (const id of touchedInstances) {
    const count = await recountEnrollment(id);
    await supabase.from('class_instances').update({ current_enrollment: count, updated_at: now }).eq('id', id);
    console.log(`  ok    instance ${id} current_enrollment = ${count}`);
  }

  // Rosters on the studio calendar are per-instance, so both cohorts need a push.
  try {
    const calendarSync = require('../utils/calendarSync');
    for (const id of touchedInstances) {
      await calendarSync.syncClassInstance(id).catch(err => console.log(`  gcal skip ${id}: ${err.message}`));
    }
    console.log(`\nCalendar resynced for ${touchedInstances.length} instance(s).`);
  } catch (e) {
    console.log(`\nCalendar sync unavailable: ${e.message}`);
  }

  console.log(`\nDone. Undo with: node scripts/repair-thu-1009-cohort.js --undo ${backupFile}`);
}

main().catch(err => { console.error(err); process.exit(1); });
