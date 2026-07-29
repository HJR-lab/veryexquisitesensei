'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { performIdempotentSend } = require('../utils/inboxSend');

// Minimal in-memory Supabase double for the single inbox_messages row under test.
// Supports the exact chains performIdempotentSend uses, including guarded updates
// (.in / .is) that only mutate when the current row matches — this is what makes
// the atomic claim testable.
function makeSupabase(row) {
  const store = { row };

  class Query {
    constructor() {
      this.filters = [];
      this._update = null;
      this._wantSelect = false;
      this._single = null; // 'single' | 'maybe' | null
    }
    select() { this._wantSelect = true; return this; }
    update(vals) { this._update = vals; return this; }
    eq(col, val) { this.filters.push(['eq', col, val]); return this; }
    in(col, vals) { this.filters.push(['in', col, vals]); return this; }
    is(col, val) { this.filters.push(['is', col, val]); return this; }
    single() { this._single = 'single'; return this._exec(); }
    maybeSingle() { this._single = 'maybe'; return this._exec(); }
    then(resolve, reject) { return this._exec().then(resolve, reject); }

    _match(r) {
      if (!r) return false;
      return this.filters.every(([op, col, val]) => {
        if (op === 'eq') return r[col] === val;
        if (op === 'in') return val.includes(r[col]);
        if (op === 'is') return val === null ? (r[col] === null || r[col] === undefined) : r[col] === val;
        return true;
      });
    }
    async _exec() {
      const matches = this._match(store.row);
      if (this._update) {
        if (matches) Object.assign(store.row, this._update);
        if (this._single === 'single') {
          return matches ? { data: { ...store.row }, error: null } : { data: null, error: { code: 'PGRST116' } };
        }
        if (this._single === 'maybe') {
          return { data: matches ? { ...store.row } : null, error: null };
        }
        return { data: null, error: null };
      }
      if (this._single === 'single') {
        return matches ? { data: { ...store.row }, error: null } : { data: null, error: { code: 'PGRST116' } };
      }
      if (this._single === 'maybe') {
        return { data: matches ? { ...store.row } : null, error: null };
      }
      return { data: matches ? [{ ...store.row }] : [], error: null };
    }
  }

  return { store, from() { return new Query(); } };
}

function baseRow() {
  return {
    id: 'msg-1',
    status: 'draft_ready',
    draft_reply: 'Hello, see you in class!',
    from_email: 'student@example.com',
    subject: 'Question',
    gmail_thread_id: 't1',
    gmail_message_id: 'gm1',
    gmail_message_id_header: '<h1@mail>',
    gmail_sent_message_id: null,
    gmail_label_state: {},
    action_history: [],
  };
}

test('WR-01: a single send sends once and resolves', async () => {
  const { store, from } = makeSupabase(baseRow());
  let sends = 0;
  const deps = {
    supabase: { from },
    sendReply: async () => { sends += 1; return { id: 'sent-abc' }; },
    markMessageHandled: async () => ({}),
  };
  const result = await performIdempotentSend(deps, 'msg-1');
  assert.equal(sends, 1);
  assert.equal(result.outcome, 'sent');
  assert.equal(store.row.status, 'resolved');
  assert.equal(store.row.gmail_sent_message_id, 'sent-abc');
});

test('WR-01: concurrent duplicate sends only reach Gmail once', async () => {
  const { store, from } = makeSupabase(baseRow());
  let sends = 0;
  const deps = {
    supabase: { from },
    sendReply: async () => { sends += 1; await Promise.resolve(); return { id: 'sent-abc' }; },
    markMessageHandled: async () => ({}),
  };
  const [a, b] = await Promise.all([
    performIdempotentSend(deps, 'msg-1'),
    performIdempotentSend(deps, 'msg-1'),
  ]);
  assert.equal(sends, 1, 'exactly one Gmail send despite two concurrent requests');
  const outcomes = [a.outcome, b.outcome].sort();
  // one send + one loser (either a conflict, or already-sent if it observed the record)
  assert.ok(outcomes.includes('sent'));
  assert.ok(outcomes.some((o) => o === 'conflict' || o === 'already_sent'));
  assert.equal(store.row.status, 'resolved');
});

test('WR-01: retry after a partial failure (Gmail accepted, reconciliation unfinished) does NOT resend', async () => {
  // Simulate a prior attempt that sent to Gmail and recorded the id, then crashed
  // before resolving: status still 'sending', sent id present.
  const row = { ...baseRow(), status: 'sending', gmail_sent_message_id: 'sent-abc' };
  const { store, from } = makeSupabase(row);
  let sends = 0;
  const deps = {
    supabase: { from },
    sendReply: async () => { sends += 1; return { id: 'should-not-happen' }; },
    markMessageHandled: async () => ({}),
  };
  const result = await performIdempotentSend(deps, 'msg-1');
  assert.equal(sends, 0, 'no resend when a sent-message id already exists');
  assert.equal(result.outcome, 'reconciled');
  assert.equal(store.row.status, 'resolved');
  assert.equal(store.row.gmail_sent_message_id, 'sent-abc');
});

test('WR-01: an already-resolved message is an idempotent no-op', async () => {
  const row = { ...baseRow(), status: 'resolved', gmail_sent_message_id: 'sent-abc' };
  const { from } = makeSupabase(row);
  let sends = 0;
  const result = await performIdempotentSend(
    { supabase: { from }, sendReply: async () => { sends += 1; }, markMessageHandled: async () => ({}) },
    'msg-1',
  );
  assert.equal(sends, 0);
  assert.equal(result.outcome, 'already_sent');
});

test('WR-01: a Gmail send failure rolls the claim back and stays sendable (no sent id)', async () => {
  const { store, from } = makeSupabase(baseRow());
  const deps = {
    supabase: { from },
    sendReply: async () => { throw new Error('gmail 503'); },
    markMessageHandled: async () => ({}),
  };
  await assert.rejects(() => performIdempotentSend(deps, 'msg-1'), /gmail 503/);
  assert.equal(store.row.status, 'draft_ready', 'claim rolled back to the pre-send status');
  assert.equal(store.row.gmail_sent_message_id, null, 'no sent id recorded on failure');
});

test('WR-01: label cleanup failure still resolves (independently retryable)', async () => {
  const { store, from } = makeSupabase(baseRow());
  let sends = 0;
  const deps = {
    supabase: { from },
    sendReply: async () => { sends += 1; return { id: 'sent-xyz' }; },
    markMessageHandled: async () => { throw new Error('label api down'); },
  };
  const result = await performIdempotentSend(deps, 'msg-1');
  assert.equal(sends, 1);
  assert.equal(result.outcome, 'sent');
  assert.equal(store.row.status, 'resolved', 'reply sent → obligation resolved even if label cleanup failed');
  assert.equal(store.row.gmail_label_state.handled_in_gmail, false);
  assert.equal(store.row.gmail_label_state.label_cleanup_pending, true);
});
