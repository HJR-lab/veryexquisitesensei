# Course variant title format

The house format for Shopify course variant titles, to follow when creating new ones.

```
DAY • D Mon – D Mon • H:MMam-H:MMpm
DAY • D Mon – D Mon • H:MMam-H:MMpm • NO CLASS D MON
```

- Day in caps, plural: `FRIDAYS`
- En-dash `–` between the dates, one space either side
- Three-letter months: `Jun` not `June`, `Sep` not `Sept`
- Bullet `•` between every segment, including before `NO CLASS`

Example: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 3 APR`

## Why it matters

Inconsistent dash characters in these titles broke order sync on 01/07/26. `parseCourseInfo`
now covers U+2012–U+2015 so it is defended, but a consistent source keeps the parser simple
and the admin list readable.

## Existing records

**Left as they are, deliberately.** 50 historical titles deviate. They are not worth editing:
the admin Users list normalises them for display (`cohortDayAndDates` in `AdminStudents.jsx`
folds every variation into one shape), and the sync parser already tolerates them. Changing
50 live Shopify variants carries more risk than it removes.

The lists below are reference only — what the existing spread looks like, and what the
canonical form would be. No action required.

One caution if any of these is ever edited: the suggested forms add a bullet before
`NO CLASS`, which today trails the time directly. That changes the shape `parseCourseInfo`
sees, so verify the parser handles it before applying.

## Reference: current and upcoming cohorts (14)

- **2026-09-07** · 2 enrolments
  - current: `TUESDAYS • 8 Sep—13 Oct • 7:00pm-9:30pm`
  - canonical: `TUESDAYS • 8 Sep – 13 Oct • 7:00pm-9:30pm`
- **2026-08-29** · 1 enrolment
  - current: `SUNDAYS • 30 Aug—4 Oct • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 30 Aug – 4 Oct • 9:30am-12:00pm`
- **2026-08-28** · 2 enrolments
  - current: `SATURDAYS • 29 Aug—3 Oct • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 29 Aug – 3 Oct • 1:00pm-3:30pm`
- **2026-07-24** · 5 enrolments
  - current: `SATURDAYS • 25 Jul—29 Aug • 9:30am-12:00pm`
  - canonical: `SATURDAYS • 25 Jul – 29 Aug • 9:30am-12:00pm`
- **2026-07-24** · 3 enrolments
  - current: `SATURDAYS • 25 Jul—5 Sept • 9:30am-12:00pm NO CLASS 22 JUL`
  - canonical: `SATURDAYS • 25 Jul – 5 Sep • 9:30am-12:00pm • NO CLASS 22 JUL`
- **2026-07-24** · 1 enrolment
  - current: `SATURDAYS • 25 Jul—5 Sept • 9:30am-12:00pm NO CLASS 22 AUG`
  - canonical: `SATURDAYS • 25 Jul – 5 Sep • 9:30am-12:00pm • NO CLASS 22 AUG`
- **2026-07-23** · 2 enrolments
  - current: `FRIDAYS • 17 Jul—21 Aug • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 17 Jul – 21 Aug • 9:30am-12:00pm`
- **2026-07-23** · 7 enrolments
  - current: `FRIDAYS • 24 Jul—28 Aug • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 24 Jul – 28 Aug • 9:30am-12:00pm`
- **2026-07-22** · 9 enrolments
  - current: `THURSDAYS • 23 Jul—27 Aug • 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 23 Jul – 27 Aug • 7:00pm-9:30pm`
- **2026-07-22** · 2 enrolments
  - current: `THURSDAYS • 9 Jul—13 Aug • 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 9 Jul – 13 Aug • 7:00pm-9:30pm`
- **2026-07-20** · 7 enrolments
  - current: `TUESDAYS • 21 Jul—25 Aug • 7:00pm-9:30pm`
  - canonical: `TUESDAYS • 21 Jul – 25 Aug • 7:00pm-9:30pm`
- **2026-07-11** · 2 enrolments
  - current: `SATURDAYS • 11 Jul –15 Aug • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 11 Jul – 15 Aug • 1:00pm-3:30pm`
- **2026-07-10** · 7 enrolments
  - current: `SATURDAYS • 11 Jul—15 Aug • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 11 Jul – 15 Aug • 1:00pm-3:30pm`
- **2026-07-04** · 9 enrolments
  - current: `SUNDAYS • 5 Jul—9 Aug • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 5 Jul – 9 Aug • 9:30am-12:00pm`

## Reference: past cohorts (36)

- **2026-06-04** · 4 enrolments
  - current: `FRIDAYS • 5 June–10 July • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 5 Jun – 10 Jul • 9:30am-12:00pm`
- **2026-06-02** · 9 enrolments
  - current: `TUESDAYS • 2 June –7 July • 7:00pm-9:30pm`
  - canonical: `TUESDAYS • 2 Jun – 7 Jul • 7:00pm-9:30pm`
- **2026-05-29** · 5 enrolments
  - current: `SATURDAYS • 30 May - 18 July • 9:30am-12:00pm NO CLASS 6 JUN`
  - canonical: `SATURDAYS • 30 May – 18 Jul • 9:30am-12:00pm • NO CLASS 6 JUN`
- **2026-05-29** · 3 enrolments
  - current: `SATURDAYS • 30 May –11 July • 9:30am-12:00pm NO CLASS 6 JUN`
  - canonical: `SATURDAYS • 30 May – 11 Jul • 9:30am-12:00pm • NO CLASS 6 JUN`
- **2026-05-27** · 7 enrolments
  - current: `THURSDAYS • 28 May–2 July • 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 28 May – 2 Jul • 7:00pm-9:30pm`
- **2026-05-23** · 7 enrolments
  - current: `SUNDAYS • 24 May –28 June • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 24 May – 28 Jun • 9:30am-12:00pm`
- **2026-05-22** · 6 enrolments
  - current: `SATURDAYS • 23 May –4 July • 1:00pm-3:30pm NO CLASS 6 JUN`
  - canonical: `SATURDAYS • 23 May – 4 Jul • 1:00pm-3:30pm • NO CLASS 6 JUN`
- **2026-04-23** · 5 enrolments
  - current: `FRIDAYS • 24 Apr–29 May • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 24 Apr – 29 May • 9:30am-12:00pm`
- **2026-04-21** · 9 enrolments
  - current: `TUESDAYS • 21 Apr–26 May • 7:00pm-9:30pm`
  - canonical: `TUESDAYS • 21 Apr – 26 May • 7:00pm-9:30pm`
- **2026-04-16** · 1 enrolment
  - current: `THURSDAYS • 16 Apr–21 May • 7:00 pm - 9:30 pm`
  - canonical: `THURSDAYS • 16 Apr – 21 May • 7:00pm-9:30pm`
- **2026-04-15** · 7 enrolments
  - current: `THURSDAYS • 16 Apr–21 May • 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 16 Apr – 21 May • 7:00pm-9:30pm`
- **2026-04-11** · 8 enrolments
  - current: `SUNDAYS • 12 Apr –17 May • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 12 Apr – 17 May • 9:30am-12:00pm`
- **2026-04-10** · 8 enrolments
  - current: `SATURDAYS • 11 Apr –16 May • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 11 Apr – 16 May • 1:00pm-3:30pm`
- **2026-04-10** · 5 enrolments
  - current: `SATURDAYS • 11 Apr - 23 May • 9:30am-12:00pm`
  - canonical: `SATURDAYS • 11 Apr – 23 May • 9:30am-12:00pm`
- **2026-04-10** · 1 enrolment
  - current: `SATURDAYS • 11 Apr –16 May • 9:30am-12:00pm`
  - canonical: `SATURDAYS • 11 Apr – 16 May • 9:30am-12:00pm`
- **2026-03-09** · 9 enrolments
  - current: `TUESDAYS • 10 Mar–14 Apr • 7:00pm-9:30pm`
  - canonical: `TUESDAYS • 10 Mar – 14 Apr • 7:00pm-9:30pm`
- **2026-03-05** · 1 enrolment
  - current: `FRIDAYS • 6 Mar–17 Apr • 9:30am-12:00pm NO CLASS 10 APR`
  - canonical: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 10 APR`
- **2026-03-05** · 3 enrolments
  - current: `FRIDAYS • 6 Mar–17 Apr • 9:30am-12:00pm NO CLASS 3 APR`
  - canonical: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 3 APR`
- **2026-03-05** · 3 enrolments
  - current: `FRIDAYS • 6 Mar–10 Apr • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 6 Mar – 10 Apr • 9:30am-12:00pm`
- **2026-03-05** · 1 enrolment
  - current: `FRIDAYS • 6 Mar–17 Apr • 9:30am-12:00pm NO CLASS 10APR`
  - canonical: `FRIDAYS • 6 Mar – 17 Apr • 9:30am-12:00pm • NO CLASS 10 APR`
- **2026-03-04** · 9 enrolments
  - current: `THURSDAYS • 5 Mar–9 Apr • 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 5 Mar – 9 Apr • 7:00pm-9:30pm`
- **2026-02-28** · 8 enrolments
  - current: `SUNDAYS • 1 Mar –5 Apr • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 1 Mar – 5 Apr • 9:30am-12:00pm`
- **2026-02-27** · 8 enrolments
  - current: `SATURDAYS • 28 Feb –4 Apr • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 28 Feb – 4 Apr • 1:00pm-3:30pm`
- **2026-02-27** · 8 enrolments
  - current: `SATURDAYS • 28 Feb –4 Apr • 9:30am-12:00pm`
  - canonical: `SATURDAYS • 28 Feb – 4 Apr • 9:30am-12:00pm`
- **2026-02-05** · 6 enrolments
  - current: `THURSDAYS • 22 Jan –26 Feb • 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 22 Jan – 26 Feb • 7:00pm-9:30pm`
- **2026-01-23** · 9 enrolments
  - current: `FRIDAYS • 23 Jan –27 Feb • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 23 Jan – 27 Feb • 9:30am-12:00pm`
- **2026-01-23** · 2 enrolments
  - current: `FRIDAYS • 23 Jan – 27 Feb • 9:30am-12:00pm`
  - canonical: `FRIDAYS • 23 Jan – 27 Feb • 9:30am-12:00pm`
- **2026-01-22** · 3 enrolments
  - current: `THURSDAYS • 22 Jan – 26 Feb 7:00pm-9:30pm`
  - canonical: `THURSDAYS • 22 Jan – 26 Feb • 7:00pm-9:30pm`
- **2026-01-20** · 9 enrolments
  - current: `TUESDAYS • 20 Jan –3 Mar • 7:00pm-9:30pm - NO CLASS 17 FEB`
  - canonical: `TUESDAYS • 20 Jan – 3 Mar • 7:00pm-9:30pm • NO CLASS 17 FEB`
- **2026-01-20** · 1 enrolment
  - current: `TUESDAYS • 20 Jan – 3 Mar • 7:00pm-9:30pm`
  - canonical: `TUESDAYS • 20 Jan – 3 Mar • 7:00pm-9:30pm`
- **2026-01-18** · 2 enrolments
  - current: `SUNDAYS • 18 Jan – 22 Feb • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 18 Jan – 22 Feb • 9:30am-12:00pm`
- **2026-01-18** · 7 enrolments
  - current: `SUNDAYS • 18 Jan –22 Feb • 9:30am-12:00pm`
  - canonical: `SUNDAYS • 18 Jan – 22 Feb • 9:30am-12:00pm`
- **2026-01-17** · 5 enrolments
  - current: `SATURDAYS • 17 Jan –21 Feb • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm`
- **2026-01-17** · 9 enrolments
  - current: `SATURDAYS • 17 Jan –21 Feb • 9:30am-12:00pm`
  - canonical: `SATURDAYS • 17 Jan – 21 Feb • 9:30am-12:00pm`
- **2026-01-17** · 4 enrolments
  - current: `SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm`
  - canonical: `SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm`
- **2026-01-17** · 1 enrolment
  - current: `SATURDAYS • 17 Jan – 21 Feb • 9:30am-12:00pm`
  - canonical: `SATURDAYS • 17 Jan – 21 Feb • 9:30am-12:00pm`
