-- Stop handing every new customer record six bookable classes.
--
-- customers.classes_allocated defaulted to 6. That is not a placeholder: booking
-- eligibility reads this counter BEFORE the enrollment ledger
-- (server/routes/classes.js), so six free classes were a real, bookable
-- entitlement attached to every customer row ever created — students who only
-- ever browsed, duplicate records, and staff accounts alike.
--
-- Audit 11/08/26: 1082 of 1289 customers sat at exactly 6, and 994 of them had
-- never made a booking. Allocation should come from a purchase, which
-- courseEnrollmentManager already sets explicitly.
--
-- Paired with the application-level default in utils/customerDb.js, which had
-- its own `|| 6`. Both had to change or new records would keep inheriting it.
--
-- See kanban t_ca110f47 and scripts/audit-legacy-classes-allocated.js.

ALTER TABLE customers ALTER COLUMN classes_allocated SET DEFAULT 0;

COMMENT ON COLUMN customers.classes_allocated IS
  'Legacy per-customer class allocation, consulted by booking eligibility BEFORE the enrollment ledger. Set from an actual purchase; never auto-defaulted. Prefer the bookings ledger (getEnrollmentCredits) for anything new.';
