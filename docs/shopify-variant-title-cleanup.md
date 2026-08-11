# Shopify variant titles needing tidy-up

Generated 2026-08-11. 50 distinct titles deviate from the house format.

**House format:** `DAY • D Mon – D Mon • H:MMam-H:MMpm` (+ ` • NO CLASS D MON`)
En-dash (–) between dates with a space either side. Three-letter months. No stray spaces.

Requires a manual edit in Shopify admin — the API token has no `write_products`.

Why it matters: inconsistent dashes in these titles broke order sync on 01/07/26. The
parser now covers U+2012–U+2015 so it is defended, but the source data is still mixed.
The admin Users list normalises these for display; this list fixes them at source.

## Current and upcoming cohorts (14) — worth fixing

- [ ] **2026-09-07** · 2 enrolments
  - now: `TUESDAYS • 8 Sep—13 Oct • 7:00pm-9:30pm`
  - fix: `TUESDAYS • 8 Sep – 13 Oct • 7:00pm-9:30pm`
- [ ] **2026-08-29** · 1 enrolment
  - now: `SUNDAYS • 30 Aug—4 Oct • 9:30am-12:00pm`
  - fix: `SUNDAYS • 30 Aug – 4 Oct • 9:30am-12:00pm`
- [ ] **2026-08-28** · 2 enrolments
  - now: `SATURDAYS • 29 Aug—3 Oct • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 29 Aug – 3 Oct • 1:00pm-3:30pm`
- [ ] **2026-07-24** · 5 enrolments
  - now: `SATURDAYS • 25 Jul—29 Aug • 9:30am-12:00pm`
  - fix: `SATURDAYS • 25 Jul – 29 Aug • 9:30am-12:00pm`
- [ ] **2026-07-24** · 3 enrolments
  - now: `SATURDAYS • 25 Jul—5 Sept • 9:30am-12:00pm NO CLASS 22 JUL`
  - fix: `SATURDAYS • 25 Jul – 5 Sep • 9:30am-12:00pm • NO CLASS 22 JUL`
- [ ] **2026-07-24** · 1 enrolment
  - now: `SATURDAYS • 25 Jul—5 Sept • 9:30am-12:00pm NO CLASS 22 AUG`
  - fix: `SATURDAYS • 25 Jul – 5 Sep • 9:30am-12:00pm • NO CLASS 22 AUG`
- [ ] **2026-07-23** · 2 enrolments
  - now: `FRIDAYS • 17 Jul—21 Aug • 9:30am-12:00pm`
  - fix: `FRIDAYS • 17 Jul – 21 Aug • 9:30am-12:00pm`
- [ ] **2026-07-23** · 7 enrolments
  - now: `FRIDAYS • 24 Jul—28 Aug • 9:30am-12:00pm`
  - fix: `FRIDAYS • 24 Jul – 28 Aug • 9:30am-12:00pm`
- [ ] **2026-07-22** · 9 enrolments
  - now: `THURSDAYS • 23 Jul—27 Aug • 7:00pm-9:30pm`
  - fix: `THURSDAYS • 23 Jul – 27 Aug • 7:00pm-9:30pm`
- [ ] **2026-07-22** · 2 enrolments
  - now: `THURSDAYS • 9 Jul—13 Aug • 7:00pm-9:30pm`
  - fix: `THURSDAYS • 9 Jul – 13 Aug • 7:00pm-9:30pm`
- [ ] **2026-07-20** · 7 enrolments
  - now: `TUESDAYS • 21 Jul—25 Aug • 7:00pm-9:30pm`
  - fix: `TUESDAYS • 21 Jul – 25 Aug • 7:00pm-9:30pm`
- [ ] **2026-07-11** · 2 enrolments
  - now: `SATURDAYS • 11 Jul –15 Aug • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 11 Jul – 15 Aug • 1:00pm-3:30pm`
- [ ] **2026-07-10** · 7 enrolments
  - now: `SATURDAYS • 11 Jul—15 Aug • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 11 Jul – 15 Aug • 1:00pm-3:30pm`
- [ ] **2026-07-04** · 9 enrolments
  - now: `SUNDAYS • 5 Jul—9 Aug • 9:30am-12:00pm`
  - fix: `SUNDAYS • 5 Jul – 9 Aug • 9:30am-12:00pm`

## Past cohorts (36) — cosmetic, historical only

- [ ] **2026-06-04** · 4 enrolments
  - now: `FRIDAYS • 5 June–10 July • 9:30am-12:00pm`
  - fix: `FRIDAYS • 5 Jun – 10 Jul • 9:30am-12:00pm`
- [ ] **2026-06-02** · 9 enrolments
  - now: `TUESDAYS • 2 June –7 July • 7:00pm-9:30pm`
  - fix: `TUESDAYS • 2 Jun – 7 Jul • 7:00pm-9:30pm`
- [ ] **2026-05-29** · 5 enrolments
  - now: `SATURDAYS • 30 May - 18 July • 9:30am-12:00pm NO CLASS 6 JUN`
  - fix: `SATURDAYS • 30 May – 18 Jul • 9:30am-12:00pm • NO CLASS 6 JUN`
- [ ] **2026-05-29** · 3 enrolments
  - now: `SATURDAYS • 30 May –11 July • 9:30am-12:00pm NO CLASS 6 JUN`
  - fix: `SATURDAYS • 30 May – 11 Jul • 9:30am-12:00pm • NO CLASS 6 JUN`
- [ ] **2026-05-27** · 7 enrolments
  - now: `THURSDAYS • 28 May–2 July • 7:00pm-9:30pm`
  - fix: `THURSDAYS • 28 May – 2 Jul • 7:00pm-9:30pm`
- [ ] **2026-05-23** · 7 enrolments
  - now: `SUNDAYS • 24 May –28 June • 9:30am-12:00pm`
  - fix: `SUNDAYS • 24 May – 28 Jun • 9:30am-12:00pm`
- [ ] **2026-05-22** · 6 enrolments
  - now: `SATURDAYS • 23 May –4 July • 1:00pm-3:30pm NO CLASS 6 JUN`
  - fix: `SATURDAYS • 23 May – 4 Jul • 1:00pm-3:30pm • NO CLASS 6 JUN`
- [ ] **2026-04-23** · 5 enrolments
  - now: `FRIDAYS • 24 Apr–29 May • 9:30am-12:00pm`
  - fix: `FRIDAYS • 24 Apr – 29 May • 9:30am-12:00pm`
- [ ] **2026-04-21** · 9 enrolments
  - now: `TUESDAYS • 21 Apr–26 May • 7:00pm-9:30pm`
  - fix: `TUESDAYS • 21 Apr – 26 May • 7:00pm-9:30pm`
- [ ] **2026-04-16** · 1 enrolment
  - now: `THURSDAYS • 16 Apr–21 May • 7:00 pm - 9:30 pm`
  - fix: `THURSDAYS • 16 Apr – 21 May • 7:00pm-9:30pm`
- [ ] **2026-04-15** · 7 enrolments
  - now: `THURSDAYS • 16 Apr–21 May • 7:00pm-9:30pm`
  - fix: `THURSDAYS • 16 Apr – 21 May • 7:00pm-9:30pm`
- [ ] **2026-04-11** · 8 enrolments
  - now: `SUNDAYS • 12 Apr –17 May • 9:30am-12:00pm`
  - fix: `SUNDAYS • 12 Apr – 17 May • 9:30am-12:00pm`
- [ ] **2026-04-10** · 8 enrolments
  - now: `SATURDAYS • 11 Apr –16 May • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 11 Apr – 16 May • 1:00pm-3:30pm`
- [ ] **2026-04-10** · 5 enrolments
  - now: `SATURDAYS • 11 Apr - 23 May • 9:30am-12:00pm`
  - fix: `SATURDAYS • 11 Apr – 23 May • 9:30am-12:00pm`
- [ ] **2026-04-10** · 1 enrolment
  - now: `SATURDAYS • 11 Apr –16 May • 9:30am-12:00pm`
  - fix: `SATURDAYS • 11 Apr – 16 May • 9:30am-12:00pm`
- [ ] **2026-03-09** · 9 enrolments
  - now: `TUESDAYS • 10 Mar–14 Apr • 7:00pm-9:30pm`
  - fix: `TUESDAYS • 10 Mar – 14 Apr • 7:00pm-9:30pm`
- [ ] **2026-03-05** · 1 enrolment
  - now: `FRIDAYS • 6 Mar–17 Apr • 9:30am-12:00pm NO CLASS 10 APR`
  - fix: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 10 APR`
- [ ] **2026-03-05** · 3 enrolments
  - now: `FRIDAYS • 6 Mar–17 Apr • 9:30am-12:00pm NO CLASS 3 APR`
  - fix: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 3 APR`
- [ ] **2026-03-05** · 3 enrolments
  - now: `FRIDAYS • 6 Mar–10 Apr • 9:30am-12:00pm`
  - fix: `FRIDAYS • 6 Mar – 10 Apr • 9:30am-12:00pm`
- [ ] **2026-03-05** · 1 enrolment
  - now: `FRIDAYS • 6 Mar–17 Apr • 9:30am-12:00pm NO CLASS 10APR`
  - fix: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 10 APR`
- [ ] **2026-03-04** · 9 enrolments
  - now: `THURSDAYS • 5 Mar–9 Apr • 7:00pm-9:30pm`
  - fix: `THURSDAYS • 5 Mar – 9 Apr • 7:00pm-9:30pm`
- [ ] **2026-02-28** · 8 enrolments
  - now: `SUNDAYS • 1 Mar –5 Apr • 9:30am-12:00pm`
  - fix: `SUNDAYS • 1 Mar – 5 Apr • 9:30am-12:00pm`
- [ ] **2026-02-27** · 8 enrolments
  - now: `SATURDAYS • 28 Feb –4 Apr • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 28 Feb – 4 Apr • 1:00pm-3:30pm`
- [ ] **2026-02-27** · 8 enrolments
  - now: `SATURDAYS • 28 Feb –4 Apr • 9:30am-12:00pm`
  - fix: `SATURDAYS • 28 Feb – 4 Apr • 9:30am-12:00pm`
- [ ] **2026-02-05** · 6 enrolments
  - now: `THURSDAYS • 22 Jan –26 Feb • 7:00pm-9:30pm`
  - fix: `THURSDAYS • 22 Jan – 26 Feb • 7:00pm-9:30pm`
- [ ] **2026-01-23** · 9 enrolments
  - now: `FRIDAYS • 23 Jan –27 Feb • 9:30am-12:00pm`
  - fix: `FRIDAYS • 23 Jan – 27 Feb • 9:30am-12:00pm`
- [ ] **2026-01-23** · 2 enrolments
  - now: `FRIDAYS • 23 Jan – 27 Feb • 9:30am-12:00pm`
  - fix: `FRIDAYS • 23 Jan – 27 Feb • 9:30am-12:00pm`
- [ ] **2026-01-22** · 3 enrolments
  - now: `THURSDAYS • 22 Jan – 26 Feb 7:00pm-9:30pm`
  - fix: `THURSDAYS • 22 Jan – 26 Feb • 7:00pm-9:30pm`
- [ ] **2026-01-20** · 9 enrolments
  - now: `TUESDAYS • 20 Jan –3 Mar • 7:00pm-9:30pm - NO CLASS 17 FEB`
  - fix: `TUESDAYS • 20 Jan – 3 Mar • 7:00pm-9:30pm • NO CLASS 17 FEB`
- [ ] **2026-01-20** · 1 enrolment
  - now: `TUESDAYS • 20 Jan – 3 Mar • 7:00pm-9:30pm`
  - fix: `TUESDAYS • 20 Jan – 3 Mar • 7:00pm-9:30pm`
- [ ] **2026-01-18** · 2 enrolments
  - now: `SUNDAYS • 18 Jan – 22 Feb • 9:30am-12:00pm`
  - fix: `SUNDAYS • 18 Jan – 22 Feb • 9:30am-12:00pm`
- [ ] **2026-01-18** · 7 enrolments
  - now: `SUNDAYS • 18 Jan –22 Feb • 9:30am-12:00pm`
  - fix: `SUNDAYS • 18 Jan – 22 Feb • 9:30am-12:00pm`
- [ ] **2026-01-17** · 5 enrolments
  - now: `SATURDAYS • 17 Jan –21 Feb • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm`
- [ ] **2026-01-17** · 9 enrolments
  - now: `SATURDAYS • 17 Jan –21 Feb • 9:30am-12:00pm`
  - fix: `SATURDAYS • 17 Jan – 21 Feb • 9:30am-12:00pm`
- [ ] **2026-01-17** · 4 enrolments
  - now: `SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm`
  - fix: `SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm`
- [ ] **2026-01-17** · 1 enrolment
  - now: `SATURDAYS • 17 Jan – 21 Feb • 9:30am-12:00pm`
  - fix: `SATURDAYS • 17 Jan – 21 Feb • 9:30am-12:00pm`
