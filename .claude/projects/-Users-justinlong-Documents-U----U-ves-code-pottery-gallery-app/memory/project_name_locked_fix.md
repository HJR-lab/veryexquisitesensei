---
name: name_locked column added
description: Added name_locked boolean column to customers table to permanently preserve admin name edits from Shopify sync overwrite
type: project
---

Added `name_locked` boolean column to customers table on 2026-03-30.

**Why:** The sync protection via `updated_at > last_synced_at` was one-time only — after one sync cycle, the protection was lost and names got overwritten again. The code already had `name_locked` logic but the column didn't exist, so the fallback silently skipped it.

**How to apply:** Admin name edits now permanently set `name_locked = true`. The `syncCustomer()` function checks this flag first and skips name overwrite if locked. This is the correct long-term fix — no more name resets on sync.

**Mitchell Chan (id 1116):** Was repeatedly renamed from "Karyn" to "Mitchell" by admin but sync kept reverting. Now fixed with `name_locked = true`.
