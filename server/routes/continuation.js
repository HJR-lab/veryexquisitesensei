const { assertDisplayDate } = require('../utils/packageContinuation');
const {
  getOfferByToken,
  offerState,
  respondToOffer,
  MAX_EXTENSIONS,
  EXTENSION_DAYS,
} = require('../utils/continuationOffer');

// Public (tokenized) endpoints for package continuation offers.
//
// The token is the only credential — no login. Everything returned here is
// something the recipient already knows: their own first name and the dates of
// the course being offered. In particular NO capacity information is exposed;
// how full a cohort is is an admin concern.
module.exports = function(app, { asyncHandler, authenticateToken }) {

function publicView(offer) {
  return {
    state: offerState(offer),
    firstName: offer.customers?.first_name || null,
    // The real first class, never cohort_start_date (the matching key, which
    // is a day early on most live cohorts). Guarded: a date whose weekday
    // contradicts the cohort is withheld rather than shown wrong.
    startDate: assertDisplayDate(offer.first_class_date, offer.schedule_pattern),
    classTime: offer.class_time,
    schedulePattern: offer.schedule_pattern,
    expiresAt: offer.expires_at,
    canExtend: offer.extension_count < MAX_EXTENSIONS,
    extensionDays: EXTENSION_DAYS,
  };
}

// What the page shows on load.
app.get('/api/continue/:token', asyncHandler(async (req, res) => {
  const offer = await getOfferByToken(req.params.token);
  if (!offer) return res.status(404).json({ error: 'This link is not valid.' });
  res.json(publicView(offer));
}));

// Confirm, pass, or ask for more time.
app.post('/api/continue/:token/respond', asyncHandler(async (req, res) => {
  const { action } = req.body || {};
  if (!['confirm', 'pass', 'extend'].includes(action)) {
    return res.status(400).json({ error: 'Unknown action.' });
  }

  const result = await respondToOffer(req.params.token, action);

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return res.status(404).json({ error: 'This link is not valid.' });
    }
    if (result.reason === 'no_extensions_left') {
      return res.status(409).json({
        error: 'You have already had extra time on this one — please confirm or pass.',
        state: 'pending',
      });
    }
    // An internal fault (a cohort that filled when this student's place was
    // supposed to be held) must not read to the student as their mistake, and
    // must not cost them the offer. Say something neutral and let the studio
    // sort it out.
    if (result.internal) {
      return res.status(409).json({
        error: 'We could not confirm this automatically — the studio has been notified and will be in touch.',
        state: 'pending',
      });
    }
    // Already answered, or the deadline passed.
    return res.status(409).json({ error: 'This offer is no longer open.', state: result.reason });
  }

  res.json({ ok: true, action, ...publicView({ ...result.offer, customers: { first_name: null } }) });
}));

// ---------------------------------------------------------------------------
// The same offer, reachable from the student's own account.
//
// A student who asks for more time will come back days later without the
// email to hand — so the decision has to live on their dashboard too, not
// only behind a token in an inbox.
// ---------------------------------------------------------------------------

const { supabase } = require('../utils/supabaseDb');

async function pendingOfferFor(studentId) {
  const { data } = await supabase
    .from('continuation_offers')
    .select('*, customers!continuation_offers_student_id_fkey(first_name)')
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

app.get('/api/my/continuation-offer', authenticateToken, asyncHandler(async (req, res) => {
  const offer = await pendingOfferFor(req.user.dbCustomerId);
  if (!offer) return res.json({ offer: null });
  res.json({ offer: publicView(offer) });
}));

app.post('/api/my/continuation-offer/respond', authenticateToken, asyncHandler(async (req, res) => {
  const { action } = req.body || {};
  if (!['confirm', 'pass', 'extend'].includes(action)) {
    return res.status(400).json({ error: 'Unknown action.' });
  }

  // Resolve the token from the signed-in student rather than trusting one in
  // the request, so this route cannot be used to answer somebody else's offer.
  const offer = await pendingOfferFor(req.user.dbCustomerId);
  if (!offer) return res.status(404).json({ error: 'You have no open course offer.' });

  const result = await respondToOffer(offer.token, action);

  if (!result.ok) {
    if (result.reason === 'no_extensions_left') {
      return res.status(409).json({ error: 'You have already had extra time on this one — please confirm or pass.' });
    }
    if (result.internal) {
      return res.status(409).json({ error: 'We could not confirm this automatically — the studio has been notified and will be in touch.' });
    }
    return res.status(409).json({ error: 'This offer is no longer open.' });
  }

  res.json({ ok: true, action, offer: publicView({ ...result.offer, customers: { first_name: null } }) });
}));

};
