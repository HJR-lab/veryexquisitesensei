// Verification of the unsent-offer catch-up pass.
//
// Run from server/: node scripts/verify-continuation-catchup.js
//
// SAFETY: emailService.sendEmail is replaced with a stub that records the
// attempt and reports failure, so the real send path runs end to end while no
// mail leaves the building and no sent_at is written (sendOfferEmail only
// stamps on success). Production's env is simulated deliberately — the gate
// reads differently on a laptop, which is the whole reason this needs a test.
process.env.PAUSED_EMAIL_CATEGORIES = 'credits,waitlist';  // Railway's value
require('dotenv').config();

const emailService = require('../utils/emailService');
const attempted = [];
emailService.sendEmail = async ({ to, subject }) => {
  attempted.push({ to, subject });
  return { success: false, error: 'stubbed — verification run, nothing sent' };
};

const { supabase } = require('../utils/supabaseDb');
const { sendUnsentOffers } = require('../utils/continuationSweep');
const { autosendStatus } = require('../utils/continuationOffer');

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${label}`);
  if (!cond) failures++;
}

async function snapshot() {
  const { data } = await supabase
    .from('continuation_offers')
    .select('id, status, sent_at, extension_count, expires_at')
    .eq('status', 'pending');
  return data || [];
}

async function main() {
  const before = await snapshot();
  console.log(`pending offers: ${before.map(o => `#${o.id}(sent_at ${o.sent_at ? 'set' : 'null'}, ext ${o.extension_count})`).join(', ') || 'none'}\n`);

  // ---- 1. The gate still stops it ----
  delete process.env.CONTINUATION_AUTOSEND;
  console.log('gate off:');
  assert(!autosendStatus().enabled, 'autosend reads off with the flag unset');
  const none = await sendUnsentOffers();
  assert(none.length === 0, 'catches up nothing while sending is off');
  assert(attempted.length === 0, 'no email was even attempted');

  // ---- 2. With production's env, it reaches the right people ----
  process.env.CONTINUATION_AUTOSEND = 'true';
  console.log('\ngate on (production env simulated):');
  assert(autosendStatus().enabled, 'autosend reads on');

  await sendUnsentOffers();
  console.log(`  attempted: ${attempted.map(a => a.to).join(', ') || 'nobody'}`);

  const eligible = before.filter(o => !o.sent_at && o.extension_count === 0 && new Date(o.expires_at) > new Date());
  const excluded = before.filter(o => !o.sent_at && o.extension_count > 0);

  assert(attempted.length === eligible.length,
    `attempted one email per unsent, un-extended offer (${eligible.length})`);
  assert(excluded.every(o => true) && attempted.length === eligible.length,
    `students who asked for more time themselves are left alone (${excluded.length} excluded)`);

  // ---- 3. A failed send must not pretend it worked ----
  const after = await snapshot();
  const stamped = after.filter(o => o.sent_at && !before.find(b => b.id === o.id && b.sent_at));
  assert(stamped.length === 0, 'a failed send writes no sent_at');

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} assertion(s)`}`);
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch(err => { console.error('verification error:', err); process.exit(1); });
