'use strict';

// Multi-spot placeholders ("buyer+dup@…") are never mailed: the address is the
// purchaser's, not the student's. The student is onboarded once the purchaser
// fills in the details form (utils/studentOnboarding.js).

const { test } = require('node:test');
const assert = require('node:assert');
const { partitionSuppressed, isPlaceholderAddress, INBOX_ADDRESS } = require('../utils/emailService');

const BUYER = 'eunice0720@icloud.com';
const DUP = 'eunice0720+dup@icloud.com';
const DUP2 = 'eunice0720+dup2@icloud.com';

test('PG-1: recognises +dup and +dupN, bare or display-name form', () => {
  assert.equal(isPlaceholderAddress(DUP), true);
  assert.equal(isPlaceholderAddress(DUP2), true);
  assert.equal(isPlaceholderAddress(`Eunice (2) <${DUP}>`), true);
  assert.equal(isPlaceholderAddress(BUYER), false);
  assert.equal(isPlaceholderAddress('jo+pottery@gmail.com'), false);
});

test('PG-2: a lone placeholder blocks the send even with no suppression list', () => {
  const r = partitionSuppressed({ to: DUP, bcc: [INBOX_ADDRESS], suppressed: null });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.placeholders, [DUP]);
});

test('PG-3: a cohort send drops only the placeholder', () => {
  const r = partitionSuppressed({ to: INBOX_ADDRESS, bcc: [BUYER, DUP], suppressed: new Set() });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.bcc, [BUYER]);
  assert.deepEqual(r.placeholders, [DUP]);
});

test('PG-4: no placeholders and no list leaves the envelope untouched', () => {
  const r = partitionSuppressed({ to: BUYER, bcc: [INBOX_ADDRESS], suppressed: null });
  assert.equal(r.blocked, false);
  assert.equal(r.to, BUYER);
  assert.deepEqual(r.placeholders, []);
});
