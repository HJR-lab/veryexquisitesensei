# VES Credits System Design

**Date:** 2026-04-02
**Status:** Approved

## Overview

A loyalty credit system for VES pottery studio. Returning students earn $20 in VES Credits per course purchase (from their 2nd course onward). Credits can be used to offset studio access fees, firing fees (extra pieces beyond allowance), and reschedule fees. Credits can also be applied to new course purchases on request (admin manually applies Shopify discount).

## Key Decisions

- **Earn rate**: $20 per course purchase, starting from 2nd course
- **Stacking**: Credits stack indefinitely
- **Expiry**: All credits expire 31 Dec 2026
- **Auto-offset**: Studio access, firing fees, reschedule fees are automatically offset
- **Course discount**: Manual only — student must request, admin applies in Shopify and logs redemption
- **Retroactive grant**: Active/upcoming students with 2+ orders get `(course_purchase_count - 1) × $20` on launch
- **Extensible**: New earn/spend methods and denominations can be added later

## Data Model

### New table: `credit_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Auto-increment |
| `customer_id` | int FK → customers | Student reference |
| `type` | text | `earn` or `spend` |
| `amount` | decimal | Always positive. Sign determined by `type` |
| `source` | text | What triggered it (see Source Values below) |
| `reference_id` | text (nullable) | Links to source record (enrollment ID, studio booking ID, fee ID, etc.) |
| `description` | text | Human-readable description |
| `expires_at` | timestamp | 31 Dec 2026 for all current credits |
| `created_at` | timestamp | Auto-set |

**Source values:**
- `course_purchase` — earned from a new course order
- `admin_adjustment` — manual admin add/deduct
- `studio_access` — spent on studio access booking
- `firing_fee` — spent on extra firing pieces
- `reschedule_fee` — spent on reschedule fee
- `course_discount` — spent on course discount (admin-applied)

**Balance calculation:**
```sql
SELECT
  COALESCE(SUM(CASE WHEN type = 'earn' AND expires_at > NOW() THEN amount ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END), 0) AS balance
FROM credit_transactions
WHERE customer_id = ?
```

### Modified table: `bookings`

- Add `firing_pieces` column (int, nullable) — recorded at class 6.5 (biscuit fire stage) by instructor

### New table: `firing_charges`

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Auto-increment |
| `customer_id` | int FK → customers | Student reference |
| `course_enrollment_id` | int FK → course_enrollments (nullable) | Which course this relates to |
| `pieces` | int | Number of extra pieces (beyond 7 for WT) |
| `amount` | decimal | Total charge (pieces × $20) |
| `credit_applied` | decimal | Amount offset by VES Credits |
| `created_at` | timestamp | Auto-set |

### Modified table: `studio_access_bookings`

- Add `credit_applied` column (decimal, default 0) — how much was offset by VES Credits

## Credit Earning

### On new course purchase (Shopify webhook)

1. Shopify order webhook creates a new `course_enrollment`
2. System checks if student has any prior enrollment (active, upcoming, or completed) — i.e. this isn't their first course
3. If returning student: insert `earn` transaction for $20
   - `source: 'course_purchase'`
   - `reference_id`: new enrollment ID
   - `expires_at: '2026-12-31T23:59:59Z'`
   - `description`: "Earned $20 from [course name]"
4. Send "credit earned" email

### Retroactive grant (one-time launch script)

1. Query students with active or upcoming enrollment AND `course_purchase_count >= 2`
2. For each: insert single `earn` transaction for `(course_purchase_count - 1) × $20`
   - `source: 'admin_adjustment'`
   - `description`: "Retroactive VES Credit grant — [N] past courses × $20"
   - `expires_at: '2026-12-31T23:59:59Z'`
3. Send retroactive grant email to each student

### Edge cases

- **Cancelled orders**: No clawback of already-earned credits
- **Manual enrollments** (`shopify_order_id: 'MANUAL'`): Admin decides — can add credits via manual adjustment
- **First-time students**: No credits earned on first purchase

## Credit Spending (Auto-Offset)

### Studio access bookings

1. Student books studio access ($20/hr, min 2hrs)
2. System checks credit balance
3. If balance > 0: auto-apply credits (partial or full offset)
4. Insert `spend` transaction with `source: 'studio_access'`, `reference_id`: studio booking ID
5. Set `credit_applied` on the studio booking record
6. Net amount to pay = `amount_sgd - credit_applied`
7. Send "credit spent" email

### Firing fees (extra pieces)

1. Instructor records `firing_pieces` on the booking at class 6.5 (biscuit fire)
2. If pieces > included allowance (7 for WT; other course types TBD as needed): extra pieces charged at $20/pc
3. Create `firing_charges` record
4. Check credit balance, auto-offset
5. Insert `spend` transaction with `source: 'firing_fee'`
6. Send "credit spent" email

### Reschedule fees

1. Reschedule fee created (existing flow)
2. Check credit balance
3. If balance > 0: auto-apply, set `payment_status: 'paid'` if fully covered, otherwise partial offset with remainder pending
4. Insert `spend` transaction with `source: 'reschedule_fee'`
5. Send "credit spent" email

### Course discount (manual, on request)

1. Student requests credit applied to their next course
2. Admin opens student detail → Credits section → "Apply credit to course"
3. Admin enters amount → `spend` transaction with `source: 'course_discount'`
4. Admin separately applies matching discount in Shopify

### Spending rules

- Cannot spend more than current balance
- Expired credits (transactions with `expires_at < NOW()`) excluded from balance
- Spending draws from oldest credits first (FIFO by `created_at`)

## Admin UI

### Student Detail — "VES Credits" section

- **Balance display**: Current balance with expiry date
- **Transaction history table**: Date, type (earn/spend), amount (+/-), source, description
- **Actions**:
  - "Adjust credits" button — manual add/deduct with a required note field

### Attendance/Class view — firing pieces

- At class 6.5 (biscuit fire), a `firing_pieces` number input appears on the attendance row
- If pieces > 7: system shows extra charge amount and credit offset preview
- On save: creates firing charge record and auto-applies credits

## Student Portal

### New "Credits" page (nav item below existing items)

- **Balance card**: Current balance, expiry date (31 Dec 2026)
- **Transaction history**: Chronological list — date, description, +$20 / -$20, running balance
- **"What can I use credits for?" section**: Simple list:
  - Studio access fee offset (automatic)
  - Extra firing pieces offset (automatic)
  - Reschedule fee offset (automatic)
  - Course discount (contact us to request)

### Navigation

- New "Credits" item in student sidebar/nav, positioned below existing items

## Email Notifications

All emails use existing email service (Resend via mail.ves.sg) and VES email template style.

### Credit earned

- **Trigger**: New `earn` transaction created
- **Subject**: "You've earned VES Credits!"
- **Body**: Amount earned, new total balance, expiry date, link to Credits page

### Credit spent

- **Trigger**: New `spend` transaction created
- **Subject**: "VES Credit applied"
- **Body**: Amount used, what it was applied to (e.g. "Studio Access — 2hrs"), remaining balance, expiry date

### Retroactive grant (one-time)

- **Trigger**: Launch script grants retroactive credits
- **Recipients**: Only students with active/upcoming enrollment AND course_purchase_count >= 2
- **Subject**: "You have VES Credits waiting!"
- **Body**: Total credits granted, calculation breakdown (e.g. "5 past courses × $20 = $100"), what they can use it for, expiry date, link to Credits page
