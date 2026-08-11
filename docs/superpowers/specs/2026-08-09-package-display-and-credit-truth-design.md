# Package Display & Credit Source of Truth

**Date:** 09/08/26
**Status:** All five sequencing steps built. Steps 1–4 shipped (PRs #65, #66);
step 5, the un-forfeit action, is in PR #67.
**Kanban:** t_e3a1f710 (display), t_6e9d9f42 (un-forfeit action)

## Problem

A 10-class package student whose cohort has ended reads as a stale record in the admin Users list.

Nicole Wong shows `FRIDAYS • 6 Mar–17 Apr` with an **ACTIVE** badge, four months after that cohort finished. Nothing is broken — she is owed 2 classes and the enrollment is deliberately kept active so those classes are not erased — but the row describes the wrong thing. It reports the cohort, which is over, rather than the entitlement, which is open.

The underlying cause is that one enrollment row carries one cohort's dates while a 10-class package is two things stacked: a 6-week WT block, then 4 flex classes that may be taken later, in a different cohort, or as Handbuilding. `status` and `schedule` are being asked to describe both at once.

## Decisions

Settled with Justin on 09/08/26.

### 1. The package is the headline, the cohort stays beneath it

```
Nicole Wong  S+M
  10 Classes · NO EXPIRY        WT [▓▓▓▓▓▓▓▓░░] 8/10   ACTIVE
  WT0603AM_JL6
```

The package leads. The cohort identifier remains below in small grey type — it is still how a cohort is found in the calendar and on rosters, so it must not be dropped.

### 2. The status badge does not change

**ACTIVE** stays. Once the headline reads "10 Classes · NO EXPIRY", ACTIVE is accurate: the package is unexpired and classes are owed. The badge only looked wrong because it sat beside a finished cohort's dates. No new badge is introduced.

### 3. The class count comes from the actual allocation, never the product title

Ryan Ling holds 12 classes on a product sold as "10 Classes". Sourcing the headline from `course_title` would print "10 Classes" beside a 7/12 bar. The label must be derived from the real allocation so the words and the number can never disagree. `NO EXPIRY` is carried through from the product title, being a commercial term rather than a count.

### 4. Scope: the package family only

Of 91 active/upcoming enrollments:

| shape | count | current variant line | needs change |
|---|---|---|---|
| 6 of 6 — plain WT | 50 | `FRIDAYS • 17 Jul—21 Aug` | no |
| **10 of 6 — package** | **23** | `FRIDAYS • 24 Apr–29 May` | **yes** |
| 8 of 6 — HB | 11 | `8 Weeks - WEDNESDAYS` | no |
| 4 of 6 — HB | 6 | `4 Weeks / FRIDAYS` | no |
| **12 of 6 — package** | **1** | `TUESDAYS • 2 June –7 July` | **yes** |

Handbuilding variants already state their length. Plain WT needs no package line. Only the 24 package rows change.

## Structural findings

Three things surfaced during design that constrain implementation. Each is a defect in its own right.

### A. Credits carry forward between packages

Leftover flex credits roll into the next purchase. The entitlement is cumulative across enrollments, not self-contained within one.

Ryan Ling is the worked example:

- Package 1 (5231): bought 10, attended 9 — the 6-week block plus 3 flex. Closed, nothing owed.
- Package 2 (5355): bought 10, allocated **12**, attended 7, **5 owed**

The 12 exceeds the 10 he purchased because it absorbs carry-over from package 1 plus manual adjustments. A package's allocation can therefore legitimately exceed the product it was sold as.

### A2. Manual adjustments and the ledger drift apart — worked example

Ryan's balance could not be explained from the database alone. It was reconstructed from the `info@ves.sg` email thread on 09/08/26, which revealed three interventions over four months and two distinct defects:

| date | request | what was done | what the ledger held |
|---|---|---|---|
| 22/04 | injury, missing 28 Apr | *"you have 4 flex credits"* | carry-over confirmed |
| 26/06 | reschedule, class already passed | *"we have credited back your class"* | booking already `cancelled`, which **already returns** the credit — so it was returned twice |
| 04/08 | attended a class absent from the portal, **asked to be charged** | charged in the counter | **no booking existed at all** — recorded attendance understated reality by one |

The allocation had then been inflated to absorb both. Nothing carried an audit trail; the only record was Gmail.

Resolved by recording the 4 Aug class as a real booking (30031, class instance 14383) rather than hand-setting a number. Computed and stored now agree at 4 remaining for the first time on that record.

This is the strongest argument in this document for a single source of truth. Every failure came from the counter and the ledger being edited independently — a credit returned twice because the ledger had already handled it, an attended class charged in the counter but missing from the ledger, and an allocation inflated to paper over both.

Any display treating one row as one package misrepresents this. The design above still shows one row per enrollment, which is acceptable because the allocation on the live row already absorbs the carry-over — but the assumption must be stated, because it is not obvious from the schema.

### B. Two allocation fields, read by different code paths

| field | read by | Ryan before correction |
|---|---|---|
| `number_of_weeks` | `getEnrollmentCredits` for packages (`bookingDb.js:729`) | 12 |
| `class_credits_allocated` | booking eligibility (`classes.js:524-528`) | 11 |

When these disagree the admin screen and the booking screen show different balances. This is the same split that concealed Amanda Ng's blocked booking: her admin row showed a credit she could not use.

`class_credits_allocated` also behaves as an override — writing a small value there clobbers the `number_of_weeks` fallback and shrinks the whole course. Ryan's record was corrected by raising it to 12 to match, not by clearing it.

### C. Forfeited and absent bookings are not counted as consumed

`getEnrollmentCredits` filters `.in('status', ['attended','completed','booked'])` at `bookingDb.js:735` and `:749`. A no-show is neither, so the computed view silently hands the class back.

Policy, confirmed by Justin: **a no-show burns the class; an admin may return it if the student writes in with a proper explanation.**

| booking status | effect |
|---|---|
| attended, completed, booked | consumes |
| forfeited, absent | consumes |
| cancelled | returns |
| rescheduled | neutral — a replacement booking exists |

Beverly Tan proves the gap: computed says she has 1 left, she forfeited it, stored correctly says 0.

## Sequencing

Order is load-bearing.

1. **Correct `getEnrollmentCredits`** to count `forfeited` and `absent` as consumed. Until this lands, computed credits over-credit every student who no-showed.
2. **Close the 10 legacy zero-booking rows explicitly** (4569, 4570, 4574, 4575, 4583, 4655, 4707, 4708, 5083, 5084). All completed, allocated 4, zero bookings recorded, predating booking tracking. Computed reports "4 remaining" only because there is nothing to count. They are currently closed by the accident of `stored_remaining = 0`; make that deliberate before anything reads computed for eligibility.
3. **Switch booking eligibility to computed credits**, honouring an explicit admin zero as an override — the pattern already used at `admin.js:133`.
4. **Apply the display change** described above.
5. **Build the admin un-forfeit action** (t_6e9d9f42). Today the only way to return a no-show is to inflate someone's allocation, which is exactly how Ryan's record ended up with 12 and 11 disagreeing.

   Built as `POST /api/admin/bookings/:bookingId/unforfeit`, separate from `convert-to-credit` precisely so it never writes `class_credits_allocated`. It does write the stored `class_credits_used` / `class_credits_remaining`, because steps 1–3 left an explicit stored zero as an admin override that is read *before* the ledger — a returned credit would otherwise be visible and unbookable. Every reversal writes who, when and why to `booking_credit_adjustments`, which answers A2 above.

Steps 1 and 2 before step 3, or students gain classes they are not owed. Step 5 after step 1, or a returned credit is granted twice.

## Non-goals

- No new status badge or credit-type label. Unbooked package classes remain plain "unbooked" rows, per the existing convention.
- No change to Handbuilding or plain 6-week WT rows.
- Making these students invisible is not an acceptable outcome. Status-keyed code paths have already silently dropped package students between cohorts twice (commits 1fd5595, d14a007).

## Open questions

- Should a package student with unbooked classes and no upcoming cohort surface as an action item rather than sitting quietly as ACTIVE? Nicole's follow-on cohort was cancelled, leaving her owed 2 classes with nothing booked and no one prompted. Deferred; the display fix does not depend on it.
- ~~Once step 1 lands, should the stored credit columns be reduced to a display cache or stopped entirely?~~ **Answered 11/08/26 (kanban t_2e2ca8cb).** Neither, quite. The columns were never the real problem — `class_credits_remaining === 0` was, because it meant both *"an admin closed this block"* and *"the number happens to be zero"*, and two gates read it that way before ever consulting the ledger.

  Closure is now its own fact (`credits_closed_at` + `credits_closed_reason`), the ledger is authoritative for the number, and the stored columns demote to a cache that must agree with it. 19 blocks that were closed only by the accident of a zero are now closed by decision, each with a reason. 17 rows were reconciled to the ledger; Justin's call was that the ledger wins even where that reduces a live balance.

  The conflation had already trapped someone: Geraldine Lai's active package (enr 5347) was owed 3 classes by the ledger while its stored columns read zero because nothing had ever written them. She was one exhausted legacy counter away from being told she had no credits. `scripts/verify-credit-columns.js` now guards that invariant, and `scripts/verify-credit-closure-gate.js` proves closure no longer depends on the number by writing a non-zero balance onto a closed block and confirming it stays closed.
