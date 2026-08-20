/**
 * How the studio takes money that does not come out of studio credit.
 *
 * Single source of truth for the PayNow details, so the UEN a student is told
 * to pay and the UEN printed on any receipt page can never drift apart. It is
 * exposed to the frontend via `GET /api/policy/fees` rather than hardcoded in a
 * component — a wrong UEN sends a customer's money to a stranger.
 *
 * Interim by design. PayNow plus a screenshot is manual reconciliation and only
 * scales while delivery is rare; once volume justifies it this gets replaced by
 * proper card checkout, at which point the receipt-upload flow can go.
 */
module.exports = {
  PAYNOW: {
    uen: 'T17LL2238CVES',
    payee: 'VES',
    currency: 'SGD',
  },
};
