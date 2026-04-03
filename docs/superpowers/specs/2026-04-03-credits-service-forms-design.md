# Ves Credits Service Forms Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Add inline service forms to the Ves Credits page so students can use their credits directly. Studio Access links to the existing booking page. Firing is informational only (instructor-driven). Delivery and Gift expand inline with order forms that charge against the credit balance.

## Services

### Studio Access
- Tapping links to `/studio-access` (existing page)
- Credit offset already wired into the studio booking endpoint
- Shows chevron arrow to indicate navigation

### Fire an Additional Piece
- **Informational only** — not actionable by student
- Display: "$20/piece — logged by instructor during class"
- No expand, no chevron, muted styling to indicate non-interactive

### Delivery of Finished Work
- Tapping expands an inline form below the item
- Fields:
  - Delivery address (text input, required)
  - Number of pieces (number input, default 1)
- Total: $10 (flat fee regardless of pieces)
- Submit button: "Pay with Ves Credits" (disabled if balance < $10)
- On submit: `POST /api/credits/delivery` with `deliveryType: 'self'`, `recipientAddress`, `pieces`
- On success: form collapses, balance updates, transaction appears in history, success message shown

### Send to a Friend/Loved One
- Tapping expands an inline form below the item
- Fields:
  - Recipient name (text input, required)
  - Recipient phone (text input, required)
  - Delivery address (text input, required)
  - Gift message (textarea, optional)
  - Number of pieces (number input, default 1)
- Total: $10 (flat fee)
- Submit button: "Pay with Ves Credits" (disabled if balance < $10)
- On submit: `POST /api/credits/delivery` with `deliveryType: 'gift'`, `recipientName`, `recipientPhone`, `recipientAddress`, `giftMessage`, `pieces`
- On success: form collapses, balance updates, transaction appears in history, success message shown

## UX Details

- Only one form can be expanded at a time — expanding one collapses the other
- Expanded form has a subtle background (TC_LIGHT) to differentiate from the list
- After successful submission, a green confirmation message shows briefly
- Balance on the page updates immediately without full page reload (re-fetch balance + history)
- Insufficient credits: submit button disabled with "Insufficient credits" text instead of "Pay with Ves Credits"

## API

Uses the existing `POST /api/credits/delivery` endpoint (already built). No new backend work needed.

## Files Modified

- `frontend/src/pages/Credits.jsx` — add expandable forms to the service items
