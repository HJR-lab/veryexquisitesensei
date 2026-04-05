const supabaseDb = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, asyncHandler }) {

  // Get notifications for current user
  app.get('/api/notifications', authenticateToken, asyncHandler(async (req, res) => {
    const customerId = req.user.customerId;
    const unreadOnly = req.query.unread === 'true';
    const notifications = await supabaseDb.getNotificationsByCustomerId(customerId, { unreadOnly });
    res.json({ success: true, notifications });
  }));

  // Get unread count
  app.get('/api/notifications/unread-count', authenticateToken, asyncHandler(async (req, res) => {
    const customerId = req.user.customerId;
    const count = await supabaseDb.getUnreadNotificationCount(customerId);
    res.json({ success: true, count });
  }));

  // Mark single notification as read
  app.put('/api/notifications/:id/read', authenticateToken, asyncHandler(async (req, res) => {
    const customerId = req.user.customerId;
    const notificationId = parseInt(req.params.id);
    await supabaseDb.markNotificationRead(notificationId, customerId);
    res.json({ success: true });
  }));

  // Mark all notifications as read
  app.put('/api/notifications/read-all', authenticateToken, asyncHandler(async (req, res) => {
    const customerId = req.user.customerId;
    await supabaseDb.markAllNotificationsRead(customerId);
    res.json({ success: true });
  }));
};
