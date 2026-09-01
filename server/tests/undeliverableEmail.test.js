'use strict';

// anomalyProbe builds the shared Supabase client at require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { undeliverableFindings } = require('../utils/anomalyProbe');

const SIAN = { id: 3253, first_name: 'Sian', last_name: 'Bostrom', email: 'sianprideaux@gmail.com' };
const JESSIE = { id: 900, first_name: 'Jessie', last_name: 'Ong', email: 'jessieong326@yahoo.com' };
const bounce = (email, created_at = '2026-08-31 04:14:39+00') => ({ email, created_at, origin: 'bounce' });

test('EM-1: a customer whose stored address is suppressed is a high-severity finding', () => {
  // The Sian Bostrom case: her order carried a typo, the address hard-bounced,
  // Resend suppressed it, and the app went on recording sends as successful.
  const f = undeliverableFindings([bounce('sianprideaux@gmail.com')], [SIAN, JESSIE]);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'high');
  assert.equal(f[0].type, 'undeliverable_customer_email');
  assert.equal(f[0].student_id, 3253);
  assert.match(f[0].details, /suppression list/);
  assert.match(f[0].details, /records it as sent/);
});

test('EM-2: typos nobody has stored are ignored', () => {
  // These are addresses mistyped into the sign-in form. The magic link bounced
  // and got suppressed, but no customer holds them, so nobody lost anything.
  // Reporting them daily would train the reader to ignore the digest.
  const noise = [
    bounce('jessieing326@yahoo.com'),
    bounce('ngel_limzx@hotmail.com'),
    bounce('valentina.neuhauswr@mac.com'),
    bounce('info@ves.com'),
  ];
  assert.deepEqual(undeliverableFindings(noise, [SIAN, JESSIE]), []);
});

test('EM-3: matching ignores case and surrounding whitespace', () => {
  // Resend echoes back whatever was submitted; customers is admin-edited.
  assert.equal(undeliverableFindings([bounce('  SianPrideaux@Gmail.com ')], [SIAN]).length, 1);
  assert.equal(undeliverableFindings([bounce('sianprideaux@gmail.com')], [{ ...SIAN, email: ' SIANPRIDEAUX@GMAIL.COM' }]).length, 1);
});

test('EM-4: an empty or missing suppression list says nothing', () => {
  assert.deepEqual(undeliverableFindings([], [SIAN, JESSIE]), []);
  assert.deepEqual(undeliverableFindings(null, [SIAN]), []);
  assert.deepEqual(undeliverableFindings(undefined, [SIAN]), []);
});

test('EM-5: customers without an address never match', () => {
  // A blank email must not collide with a blank/absent suppression entry.
  const noEmail = [{ id: 1, first_name: 'No', last_name: 'Email', email: null },
                   { id: 2, first_name: 'Empty', last_name: 'Email', email: '' }];
  assert.deepEqual(undeliverableFindings([bounce('')], noEmail), []);
  assert.deepEqual(undeliverableFindings([{ email: null, created_at: 'x', origin: 'bounce' }], noEmail), []);
});

test('EM-6: every affected customer is named, not just the first', () => {
  const f = undeliverableFindings(
    [bounce('sianprideaux@gmail.com'), bounce('jessieong326@yahoo.com')],
    [SIAN, JESSIE]
  );
  assert.equal(f.length, 2);
  assert.deepEqual(f.map(x => x.student_id).sort((a, b) => a - b), [900, 3253]);
});

test('EM-7: a customer with no name still produces a usable finding', () => {
  const f = undeliverableFindings([bounce('x@y.com')], [{ id: 77, first_name: null, last_name: null, email: 'x@y.com' }]);
  assert.equal(f.length, 1);
  assert.match(f[0].student_name, /customer 77/);
});
