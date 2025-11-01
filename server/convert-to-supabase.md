# Prisma to Supabase Conversion Plan

## Status: This file will be converted automatically

Given the large size of index.js (1700+ lines, 50+ Prisma calls), I'll replace it entirely with a Supabase-only version.

## Key Replacements Needed:

### Imports (Line 10)
```js
// OLD:
const { syncCustomer, migratePotteryPieces, getOrSyncCustomer, prisma } = require('./utils/shopifySync');

// NEW:
const { syncCustomer, migratePotteryPieces, getOrSyncCustomer } = require('./utils/shopifySync');
const supabaseDb = require('./utils/supabaseDb');
```

### Shutdown Handlers (Lines 1707-1723)
```js
// REMOVE: await prisma.$disconnect();
```

This conversion will systematically replace all 50+ Prisma calls with the Supabase adapter functions we created.
