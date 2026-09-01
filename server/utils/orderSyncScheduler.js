/**
 * Runs the Shopify order sweep on a timer.
 *
 * The sweep (runOrderSync in routes/shopify.js) was previously reachable only
 * through the admin Sync button, which made it invisible infrastructure with a
 * human in the loop. That mattered because it is the only path that creates
 * Clay Club membership rows, so a purchase on a quiet day stayed unrecorded
 * until someone happened to click Sync.
 *
 * Each pass is windowed by sync_tracking.shopify_orders.last_sync_at, so a
 * quiet interval costs one Shopify query returning nothing. Work is idempotent
 * — enrollments dedupe on (shopify_order_id, shopify_line_item_id) and emails
 * dedupe through sent_emails — so a repeated window is safe, not a double-send.
 */

const DEFAULT_INTERVAL_MINUTES = 15;

/**
 * @param {Function} runOrderSync  from app.locals.runOrderSync
 * @param {number}   intervalMinutes  0 or negative disables the timer entirely
 */
function startOrderSyncPolling(runOrderSync, intervalMinutes = DEFAULT_INTERVAL_MINUTES) {
  if (typeof runOrderSync !== 'function') {
    console.error('[order-sync] No runOrderSync available — timer not started');
    return null;
  }

  if (!(intervalMinutes > 0)) {
    console.log('[order-sync] Polling disabled (ORDER_SYNC_INTERVAL_MINUTES <= 0)');
    return null;
  }

  const pass = async (label) => {
    try {
      const result = await runOrderSync();
      // Only speak up when the sweep actually did something. Most passes find
      // an empty window, and logging those buries the ones that matter.
      if (result.processedCount > 0 || result.enrollmentsCreated > 0) {
        console.log(`[order-sync] ${label}: ${result.message}`);
      }
    } catch (err) {
      if (err.code === 'SYNC_IN_PROGRESS') {
        // An admin pressed Sync, or the previous tick is still going on a wide
        // window. Skipping is correct — the watermark means nothing is lost.
        console.log(`[order-sync] ${label}: skipped, a sync is already running`);
        return;
      }
      console.error(`[order-sync] ${label} failed:`, err.message);
    }
  };

  // Catch up on anything that landed while the process was down before
  // settling into the regular cadence.
  pass('startup sweep');

  const timer = setInterval(() => pass('scheduled sweep'), intervalMinutes * 60 * 1000);
  timer.unref?.();

  console.log(`[order-sync] Polling started (every ${intervalMinutes}m)`);
  return timer;
}

module.exports = { startOrderSyncPolling, DEFAULT_INTERVAL_MINUTES };
