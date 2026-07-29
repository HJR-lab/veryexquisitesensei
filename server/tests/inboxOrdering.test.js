'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');

// Stub the shared Supabase module BEFORE requiring the route, so the inbox list
// query runs against a recorder instead of a real client.
const sbPath = require.resolve('../utils/supabaseDb');
const orderCalls = [];
let limitCalledAt = Infinity;
let opIndex = 0;

const recorder = {
  select() { return this; },
  eq() { return this; },
  in() { return this; },
  order(col, opts) { orderCalls.push({ col, opts, index: opIndex++, beforeLimit: opIndex <= limitCalledAt }); return this; },
  limit() { limitCalledAt = opIndex++; return this; },
  then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
};
require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: { supabase: { from() { return recorder; } } } };

const buildInboxRoutes = require('../routes/inbox');

test('WR-05: inbox list orders by priority_rank (urgency), before applying the row limit', async () => {
  const routes = {};
  const passthrough = (req, res, next) => (next ? next() : undefined);
  const app = {
    get(pathStr, ...handlers) { routes['GET ' + pathStr] = handlers[handlers.length - 1]; },
    post() {}, put() {},
  };
  buildInboxRoutes(app, { authenticateToken: passthrough, requireAdmin: passthrough, asyncHandler: (fn) => fn });

  const handler = routes['GET /api/admin/inbox'];
  assert.ok(handler, 'inbox list route registered');

  let jsonBody = null;
  await handler({ query: {} }, { json: (b) => { jsonBody = b; } });

  const rankOrder = orderCalls.find((c) => c.col === 'priority_rank');
  assert.ok(rankOrder, 'query orders by priority_rank, not the lexicographic priority text');
  assert.ok(rankOrder.opts && rankOrder.opts.ascending === true, 'ascending so urgent (rank 0) comes first');
  assert.ok(rankOrder.beforeLimit, 'ordering is applied before the 100-row limit so urgent rows are not truncated');
  assert.ok(jsonBody && Array.isArray(jsonBody.messages), 'handler responded with messages');
});
