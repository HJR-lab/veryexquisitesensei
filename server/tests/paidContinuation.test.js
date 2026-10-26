'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');

const { parseCatalog } = require('../utils/shopifyCourseCatalog');
const {
  pickCurrentEnrollments,
  matchNextCourse,
  paidAutosendStatus,
  buildPaidReport,
} = require('../utils/paidContinuation');

const variant = (id, title, extra = {}) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title,
  price: '420.00',
  inventoryQuantity: 8,
  inventoryPolicy: 'DENY',
  inventoryItem: { tracked: true },
  ...extra,
});

const products = [
  {
    id: 'gid://shopify/Product/1',
    title: 'Wheelthrowing Beginner/Ext 6 Weeks',
    variants: { nodes: [
      variant(11, 'FRIDAYS • 30 Oct—4 Dec • 9:30am-12:00pm'),
      variant(12, 'FRIDAYS • 11 Dec—15 Jan • 9:30am-12:00pm'),
      variant(13, 'THURSDAYS • 10 Dec—14 Jan • 7:00pm-9:30pm'),
    ] },
  },
  // Same slots, but packages and pools are never offered to a continuing student.
  {
    id: 'gid://shopify/Product/2',
    title: 'Wheelthrowing Beginner/Ext 6 Weeks • 3 Course Package',
    variants: { nodes: [variant(21, 'FRIDAYS • 11 Dec—15 Jan • 9:30am-12:00pm')] },
  },
  {
    id: 'gid://shopify/Product/3',
    title: 'Wheelthrowing & Handbuilding Beginner/Ext 10 Classes • NO EXPIRY',
    variants: { nodes: [variant(31, 'FRIDAYS • 11 Dec—15 Jan • 9:30am-12:00pm')] },
  },
];

test('parseCatalog keeps single WT courses that have not started', () => {
  const courses = parseCatalog(products, '2026-11-02');
  assert.deepStrictEqual(courses.map(c => c.variantId), [
    'gid://shopify/ProductVariant/13',
    'gid://shopify/ProductVariant/12',
  ]);
  const fri = courses.find(c => c.variantId.endsWith('/12'));
  assert.strictEqual(fri.startDate, '2026-12-11');
  assert.strictEqual(fri.schedulePattern, 'FRIDAY');
  assert.strictEqual(fri.classTime, '9:30 AM - 12:00 PM');
  assert.strictEqual(fri.price, 420);
  assert.strictEqual(fri.inventoryTracked, true);
});

test('parseCatalog reads a January listing seen in November as next year', () => {
  const courses = parseCatalog([{
    id: 'p', title: 'Wheelthrowing Beginner/Ext 6 Weeks',
    variants: { nodes: [variant(41, 'SATURDAYS • 9 Jan—13 Feb • 1:00pm-3:30pm')] },
  }], '2026-11-20');
  assert.strictEqual(courses.length, 1);
  assert.strictEqual(courses[0].startDate, '2027-01-09');
});

const enrollment = (over = {}) => ({
  id: 1,
  student_id: 100,
  status: 'active',
  course_type: 'Wheelthrowing Beginner',
  schedule_pattern: 'FRIDAY',
  class_time: '9:30 AM - 12:00 PM',
  course_start_date: '2026-10-30',
  course_end_date: '2026-12-04',
  package_total_courses: null,
  package_total_classes: null,
  ...over,
});

test('pickCurrentEnrollments takes single-course students mid-course or just finished', () => {
  const rows = [
    enrollment({ student_id: 1 }),
    // Finished more than three weeks ago: no longer current.
    enrollment({ student_id: 2, course_start_date: '2026-08-01', course_end_date: '2026-09-05' }),
    // Package and 10-class pool students have their own routes.
    enrollment({ student_id: 3, package_total_courses: 3, package_total_classes: 18 }),
    enrollment({ student_id: 4, package_total_classes: 10 }),
    // Already bought a later course: their newest enrollment has not started.
    enrollment({ student_id: 5 }),
    enrollment({ student_id: 5, id: 9, course_start_date: '2026-12-11', course_end_date: '2027-01-15' }),
    enrollment({ student_id: 6, status: 'paused' }),
    // Hasn't started yet.
    enrollment({ student_id: 7, course_start_date: '2026-11-20', course_end_date: '2026-12-25' }),
  ];
  const picked = pickCurrentEnrollments(rows, '2026-11-02').map(e => e.student_id);
  assert.deepStrictEqual(picked, [1]);
});

test('matchNextCourse finds the first listing after the current course in the same slot', () => {
  const catalog = parseCatalog(products, '2026-11-02');
  const m = matchNextCourse(enrollment(), catalog, '2026-11-02');
  assert.ok(m.ok);
  assert.strictEqual(m.course.startDate, '2026-12-11');

  const night = matchNextCourse(enrollment({ schedule_pattern: 'SATURDAY' }), catalog, '2026-11-02');
  assert.deepStrictEqual(night, { ok: false, reason: 'no_listed_course' });
});

test('matchNextCourse refuses to guess between two listings for one slot and date', () => {
  const twin = (title, type) => ({
    variantId: title, productTitle: title, courseType: type,
    schedulePattern: 'FRIDAY', classTime: '9:30 AM - 12:00 PM', startDate: '2026-12-11',
  });
  const catalog = [twin('A', 'Wheelthrowing Intermediate'), twin('B', 'Wheelthrowing Beginner')];
  assert.strictEqual(matchNextCourse(enrollment(), catalog, '2026-11-02').course.variantId, 'B');
  const both = [twin('A', 'Wheelthrowing Beginner'), twin('B', 'Wheelthrowing Beginner')];
  assert.strictEqual(matchNextCourse(enrollment(), both, '2026-11-02').reason, 'ambiguous_listing');
});

test('paid offers are off unless deliberately switched on', () => {
  const prev = process.env.PAID_CONTINUATION_AUTOSEND;
  delete process.env.PAID_CONTINUATION_AUTOSEND;
  assert.strictEqual(paidAutosendStatus().enabled, false);
  process.env.PAID_CONTINUATION_AUTOSEND = 'ture';
  assert.strictEqual(paidAutosendStatus().enabled, false);
  if (prev === undefined) delete process.env.PAID_CONTINUATION_AUTOSEND;
  else process.env.PAID_CONTINUATION_AUTOSEND = prev;
});

test('the dry-run report says nothing was held', () => {
  const catalog = parseCatalog(products, '2026-11-02');
  const { subject, html } = buildPaidReport({
    created: [], failed: [], skipped: { no_listed_course: 2 }, examined: 3, listed: catalog.length,
    planned: [{ enrollment: { ...enrollment(), customers: { first_name: 'Amy', email: 'a@x.sg' } }, course: catalog[1], seats: { signups: 2, held: 0, cap: 8 } }],
    gate: { enabled: false, reason: 'PAID_CONTINUATION_AUTOSEND is not set' },
  });
  assert.match(subject, /1 student/);
  assert.match(html, /no seats were held/);
  assert.match(html, /Amy/);
});
