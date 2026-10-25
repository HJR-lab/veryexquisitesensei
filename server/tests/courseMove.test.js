'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { planCourseMove } = require('../utils/courseMove');

// Shapes taken from the WT3010AM_JL6 -> WT2810AM_JL6 move (Oct 2026).
const FROM = [101, 102, 103, 104, 105, 106].map(id => ({ id }));
const TO = ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02', '2026-12-09']
  .map((d, i) => ({ id: 201 + i, class_date: `${d} 00:00:00`, status: 'draft' }));
const PEER = {
  course_start_date: '2026-11-04', course_end_date: '2026-12-09', schedule_pattern: 'WEDNESDAY',
  class_time: '9:30 AM - 12:00 PM', start_date: '2026-10-28', expected_end_date: '2026-12-09',
};

test('CM-01: the enrollment takes the target cohort dates and weekday', () => {
  const plan = planCourseMove({ fromClasses: FROM, toClasses: TO, targetSignups: 2, targetPeer: PEER });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.enrollmentUpdate, PEER);
});

test('CM-02: without a peer the dates come from the target classes', () => {
  const plan = planCourseMove({ fromClasses: FROM, toClasses: TO, targetSignups: 0 });
  assert.equal(plan.enrollmentUpdate.course_start_date, '2026-11-04');
  assert.equal(plan.enrollmentUpdate.course_end_date, '2026-12-09');
  assert.equal(plan.enrollmentUpdate.schedule_pattern, 'WEDNESDAY');
});

test('CM-03: source bookings and the make-up that replaced one are cancelled, history is left alone', () => {
  const studentBookings = [
    { id: 1, class_instance_id: 101, original_class_instance_id: 101, status: 'rescheduled' },
    { id: 2, class_instance_id: 999, original_class_instance_id: 101, status: 'booked' }, // make-up in another course
    { id: 3, class_instance_id: 102, status: 'booked' },
    { id: 4, class_instance_id: 103, status: 'cancelled' },
    { id: 5, class_instance_id: 555, status: 'booked' }, // unrelated booking
  ];
  const plan = planCourseMove({ fromClasses: FROM, toClasses: TO, studentBookings, targetSignups: 2 });
  assert.deepEqual(plan.cancelBookingIds.sort(), [2, 3]);
  assert.ok(plan.touchedClassIds.includes(999), 'make-up class count must be refreshed');
});

test('CM-04: only target classes not already booked are booked', () => {
  const studentBookings = [{ id: 9, class_instance_id: 201, status: 'booked' }];
  const plan = planCourseMove({ fromClasses: FROM, toClasses: TO, studentBookings, targetSignups: 2 });
  assert.deepEqual(plan.bookClassIds, [202, 203, 204, 205, 206]);
});

test('CM-05: a draft cohort opens when the move reaches the threshold', () => {
  assert.equal(planCourseMove({ toClasses: TO, targetSignups: 2 }).activate, false);
  assert.equal(planCourseMove({ toClasses: TO, targetSignups: 3 }).activate, true);
});

test('CM-06: a cohort with all 8 enrollment seats taken is refused', () => {
  const plan = planCourseMove({ toClasses: TO, targetSignups: 8 });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'full');
  assert.equal(planCourseMove({ toClasses: TO, targetSignups: 7 }).ok, true);
});
