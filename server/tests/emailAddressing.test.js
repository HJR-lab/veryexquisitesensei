'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildEnvelope,
  resolveAddressing,
  INBOX_ADDRESS,
  INBOX_EMAIL,
  REPLY_TO_ADDRESS,
} = require('../utils/emailService');

const STUDENT = 'huixinchieeng@gmail.com';
const COHORT = [
  'tatyana.sivaloganathan@hotmail.com',
  'dorsiow@gmail.com',
  'kvdarcy@hotmail.co.uk',
];

test('AD-1: a one-recipient send is addressed to that person', () => {
  // The six "Dear HX" reschedule notices of 01/09/26 each had exactly one
  // recipient and still went out as To: the studio, BCC: the student. They were
  // delivered, but in the studio inbox they read as if nobody had been written
  // to — which is how this was reported as "emails fired off to VES instead".
  const { to, bcc } = resolveAddressing([STUDENT]);
  assert.equal(to, STUDENT);
  assert.deepEqual(bcc, [INBOX_ADDRESS]);
});

test('AD-2: a cohort blast keeps every recipient in BCC', () => {
  // Seven students on one course-details email must not see each other.
  const { to, bcc } = resolveAddressing(COHORT);
  assert.equal(to, INBOX_ADDRESS);
  assert.deepEqual(bcc, COHORT);
});

test('AD-3: a studio-facing notice is not BCC\'d a copy of itself', () => {
  // The anomaly digest and the cohort-ready alert address info@ves.sg as their
  // sole recipient. To + BCC of the same mailbox delivers it twice.
  for (const form of [INBOX_EMAIL, INBOX_ADDRESS, ' INFO@VES.SG ']) {
    const { to, bcc } = resolveAddressing([form]);
    assert.equal(to, INBOX_ADDRESS);
    assert.equal(bcc, undefined);
  }
});

test('AD-4: a bare string recipient is accepted, and blanks are dropped', () => {
  assert.equal(resolveAddressing(STUDENT).to, STUDENT);
  assert.deepEqual(resolveAddressing([STUDENT, null, '']).recipients, [STUDENT]);
  // Nothing to send to: the studio copy is all that is left, and there is no
  // empty BCC to hand Resend.
  const empty = resolveAddressing([]);
  assert.equal(empty.to, INBOX_ADDRESS);
  assert.deepEqual(empty.bcc, []);
});

test('AD-5: recipient_count logs the students, not the studio copy', () => {
  // sent_emails is logged from `recipients`, so the BCC'd studio copy added in
  // AD-1 must not inflate the count.
  assert.equal(resolveAddressing([STUDENT]).recipients.length, 1);
});

test('RT-1: every send carries a Reply-To at a mailbox that exists', () => {
  // FROM_ADDRESS is info@mail.ves.sg — the Resend sending subdomain, which has
  // no MX record. Without Reply-To, a student hitting Reply writes into a void.
  const envelope = buildEnvelope({ to: STUDENT, subject: 'x' });
  assert.equal(envelope.replyTo, REPLY_TO_ADDRESS);
  assert.equal(envelope.replyTo, INBOX_EMAIL);
});

test('RT-2: the SDK field is replyTo — a reply_to key is dropped on the floor', () => {
  // resend@6 reads payload.replyTo and maps it to the wire field itself. The
  // previous code set payload.reply_to, so the parameter never did anything.
  const envelope = buildEnvelope({ to: STUDENT, subject: 'x', replyTo: 'someone@ves.sg' });
  assert.equal(envelope.replyTo, 'someone@ves.sg');
  assert.ok(!('reply_to' in envelope));
});

test('RT-3: the envelope omits empty cc/bcc rather than sending []', () => {
  const envelope = buildEnvelope({ to: STUDENT, cc: [], bcc: [], subject: 'x' });
  assert.ok(!('cc' in envelope));
  assert.ok(!('bcc' in envelope));
});
