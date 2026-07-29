/**
 * Notification data access.
 *
 * First domain module extracted from the monolithic supabaseDb.js. Owns the
 * `notifications` table. supabaseDb.js re-exports these functions so existing
 * `require('./supabaseDb').createNotification(...)` call sites keep working
 * unchanged during the incremental split.
 */

const { supabase } = require('./supabaseClient');

async function createNotification({ customerId, type, title, message, data: notifData }) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      customer_id: customerId,
      type,
      title,
      message,
      data: notifData || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getNotificationsByCustomerId(customerId, { unreadOnly = false } = {}) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (unreadOnly) {
    query = query.eq('read', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function markNotificationRead(notificationId, customerId) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('customer_id', customerId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function markAllNotificationsRead(customerId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('customer_id', customerId)
    .eq('read', false);

  if (error) throw error;
  return true;
}

async function getUnreadNotificationCount(customerId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('read', false);

  if (error) throw error;
  return count || 0;
}

module.exports = {
  createNotification,
  getNotificationsByCustomerId,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
};
