'use strict';

// The send-time guard against Resend's suppression list.
//
// A hard bounce suppresses an address permanently: Resend discards every later
// message to it and returns success, so sendAndLogEmail writes a row claiming
// the customer was mailed. The daily anomaly probe reports the dead address
// once a day, but nothing stopped the next send — Sheena Lim (#3299) lost her
// class-reschedule email three hours after the probe had already flagged her.
//
// partitionSuppressed is the pure half: given an envelope and the suppression
// set, it decides what may still be sent and what has to be dropped.

const { test } = require('node:test');
const assert = require('node:assert');
const { partitionSuppressed, INBOX_EMAIL, INBOX_ADDRESS } = require('../utils/emailService');

const set = (...addresses) => new Set(addresses.map(a => a.toLowerCase()));

const DEAD = 'sheena.enhui@hotmail.com';
const LIVE = 'sheena.enhui@gmail.com';
const OTHER = 'nigel_limzx@hotmail.com';

test('SG-1: a lone suppressed recipient blocks the send', () => {
  // The Sheena case. resolveAddressing puts a single student in To with the
  // studio on BCC, so the message is entirely for an address that is gone.
  const r = partitionSuppressed({ to: DEAD, bcc: [INBOX_ADDRESS], suppressed: set(DEAD) });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.dropped, [DEAD]);
});

test('SG-2: a lone deliverable recipient is untouched', () => {
  const r = partitionSuppressed({ to: LIVE, bcc: [INBOX_ADDRESS], suppressed: set(DEAD) });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.dropped, []);
  assert.equal(r.to, LIVE);
  assert.deepEqual(r.bcc, [INBOX_ADDRESS]);
});

test('SG-3: a bulk send drops only the suppressed recipients', () => {
  // One dead address must not cost the whole cohort their email.
  const r = partitionSuppressed({
    to: INBOX_ADDRESS,
    bcc: ['a@x.com', DEAD, 'c@z.com'],
    suppressed: set(DEAD),
  });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.dropped, [DEAD]);
  assert.deepEqual(r.bcc, ['a@x.com', 'c@z.com']);
});

test('SG-4: a bulk send is blocked when every customer recipient is suppressed', () => {
  // Nothing customer-facing survives, so the message would reach only the
  // studio's own BCC copy — a send that records delivery to nobody.
  const r = partitionSuppressed({
    to: INBOX_ADDRESS,
    bcc: [DEAD, OTHER],
    suppressed: set(DEAD, OTHER),
  });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.dropped.sort(), [DEAD, OTHER].sort());
});

test('SG-5: a studio-only notice is never blocked', () => {
  // The anomaly digest and other internal mail address the studio and carry no
  // customer recipients. There is nothing to protect, so the guard stays out.
  const r = partitionSuppressed({ to: INBOX_ADDRESS, suppressed: set(DEAD) });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.dropped, []);
});

test('SG-6: an unknown suppression list sends everything (fail open)', () => {
  // The list is fetched from Resend and that call can fail. Blocking all studio
  // mail because an auxiliary endpoint is down would be far worse than the
  // problem this guards against: a suppressed send is discarded harmlessly, and
  // the only real damage is the false sent_emails row.
  const r = partitionSuppressed({ to: DEAD, bcc: [INBOX_ADDRESS], suppressed: null });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.dropped, []);
  assert.equal(r.to, DEAD);
});

test('SG-7: matching ignores case and display names', () => {
  // Addresses reach sendEmail both bare and as `Name <addr>`, and Resend
  // lowercases its list. A guard that missed either form would not have caught
  // the case it exists for.
  const r = partitionSuppressed({
    to: `Sheena Lim <${DEAD.toUpperCase()}>`,
    bcc: [INBOX_ADDRESS],
    suppressed: set(DEAD),
  });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.dropped, [DEAD]);
});

test('SG-8: cc is filtered alongside bcc', () => {
  const r = partitionSuppressed({
    to: 'live@x.com',
    cc: [DEAD, 'also@x.com'],
    bcc: [INBOX_ADDRESS],
    suppressed: set(DEAD),
  });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.cc, ['also@x.com']);
  assert.deepEqual(r.dropped, [DEAD]);
});

test('SG-9: the studio address is never treated as a customer recipient', () => {
  // If the studio's own inbox were ever suppressed, dropping it must not be
  // read as "every customer recipient is gone" and block real student mail.
  const r = partitionSuppressed({
    to: LIVE,
    bcc: [INBOX_ADDRESS],
    suppressed: set(INBOX_EMAIL),
  });
  assert.equal(r.blocked, false);
  assert.equal(r.to, LIVE);
});

test('SG-10: an empty suppression list is not the same as an unknown one', () => {
  // Resend legitimately returns zero suppressions. That is a known-good answer
  // and must not be confused with the fetch having failed.
  const r = partitionSuppressed({ to: DEAD, bcc: [INBOX_ADDRESS], suppressed: new Set() });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.dropped, []);
});

// ---------------------------------------------------------------------------
// The batch path.
//
// Everything above tests the pure decision. None of it touches sendPerRecipient,
// which calls Resend's batch endpoint directly instead of going through
// sendEmail — so the guard was absent there while all ten tests above passed.
// That is the path every customer class email takes (course_details from the
// admin route, course_unconfirmed from the cohort auto-processor and the
// postpone script), including the class reschedule Sheena Lim never received.
// These exercise it end to end, with Resend stubbed at the fetch layer.

const path = require('node:path');

// A fresh copy of the module per test: the suppression list is cached for five
// minutes inside it, so one test's stubbed answer would otherwise be reused by
// the next.
function freshService({ suppressed }) {
  process.env.RESEND_API_KEY = 're_test_key';
  const wire = [];
  const realFetch = global.fetch;

  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/suppressions')) {
      if (suppressed === null) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: suppressed.map(email => ({ email })) }) };
    }
    if (u.includes('/emails/batch')) {
      const body = JSON.parse(opts.body);
      wire.push(...body.map(p => p.to));
      return {
        ok: true, status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: body.map((_, i) => ({ id: 'bmsg_' + i })) }),
      };
    }
    if (u.includes('/emails')) {
      const body = JSON.parse(opts.body);
      wire.push(body.to);
      return {
        ok: true, status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 'msg_1' }),
      };
    }
    return realFetch(url, opts);
  };

  delete require.cache[require.resolve(path.join(__dirname, '../utils/emailService.js'))];
  const svc = require('../utils/emailService');
  return { svc, wire, restore: () => { global.fetch = realFetch; } };
}

const flat = (wire) => wire.flat().map(a => String(a).toLowerCase());

test('SG-11: the batch path drops a suppressed recipient and still mails the rest', async () => {
  // The regression. A cohort postponement addressed to two students, one of
  // whom has hard-bounced: the live student must still be told, and the dead
  // address must never reach the wire.
  const { svc, wire, restore } = freshService({ suppressed: [DEAD] });
  try {
    const results = await svc.sendPerRecipient({
      subject: 'Your class has moved', html: '<p>hi</p>', recipients: [LIVE, DEAD],
    });

    assert.deepEqual(flat(wire), [LIVE]);
    assert.equal(results.find(r => r.email === LIVE).success, true);
    assert.equal(results.find(r => r.email === DEAD).success, false);
    assert.equal(results.find(r => r.email === DEAD).error, 'suppressed');
  } finally { restore(); }
});

test('SG-12: the batch path sends nothing when every recipient is suppressed', async () => {
  const { svc, wire, restore } = freshService({ suppressed: [DEAD, OTHER] });
  try {
    const results = await svc.sendPerRecipient({
      subject: 'Your class has moved', html: '<p>hi</p>', recipients: [DEAD, OTHER],
    });

    assert.deepEqual(flat(wire), []);
    assert.equal(results.every(r => r.success === false), true);
    assert.equal(results.every(r => r.error === 'suppressed'), true);
  } finally { restore(); }
});

test('SG-13: the batch path fails open when the suppression list is unavailable', async () => {
  // Same rule as SG-6: an auxiliary endpoint being down must not stop the
  // studio mailing its students.
  const { svc, wire, restore } = freshService({ suppressed: null });
  try {
    const results = await svc.sendPerRecipient({
      subject: 'Your class has moved', html: '<p>hi</p>', recipients: [LIVE, DEAD],
    });

    assert.deepEqual(flat(wire).sort(), [LIVE, DEAD].sort());
    assert.equal(results.every(r => r.success === true), true);
  } finally { restore(); }
});
