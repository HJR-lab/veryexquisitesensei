const supabaseDb = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// MEMBERSHIP ENDPOINTS
// ============================================

app.get('/api/membership/my-membership', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  const membership = await supabaseDb.getActiveMembership(dbCustomerId);

  if (!membership) {
    return res.json({
      hasMembership: false,
      message: 'No active membership found'
    });
  }

  // Calculate days remaining
  const endDate = new Date(membership.end_date);
  const today = new Date();
  const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

  res.json({
    hasMembership: true,
    membership: {
      id: membership.id,
      type: membership.membership_type,
      status: membership.status,
      startDate: membership.start_date,
      endDate: membership.end_date,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      perks: membership.perks || {
        studioAccess: true,
        communityEvents: true,
        discounts: '10% off workshops'
      }
    }
  });
}));

app.get('/api/membership/history', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  const memberships = await supabaseDb.getCustomerMemberships(dbCustomerId);

  const formattedMemberships = memberships.map(m => ({
    id: m.id,
    type: m.membership_type,
    status: m.status,
    startDate: m.start_date,
    endDate: m.end_date,
    perks: m.perks
  }));

  res.json({ memberships: formattedMemberships });
}));

// Member dashboard endpoint
app.get('/api/membership/dashboard', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  // Fetch active membership, history, gallery pieces, and enrollment status in parallel
  const [activeMembership, allMemberships, galleryPieces, enrollmentRes] = await Promise.all([
    supabaseDb.getActiveMembership(dbCustomerId),
    supabaseDb.getCustomerMemberships(dbCustomerId),
    supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', dbCustomerId)
      .in('status', ['active', 'pending'])
      .limit(1)
  ]);

  const hasActiveEnrollments = (enrollmentRes.data || []).length > 0;

  if (!activeMembership) {
    return res.json({
      hasMembership: false,
      hasActiveEnrollments,
      history: allMemberships.map(m => ({
        id: m.id, type: m.membership_type, status: m.status,
        startDate: m.start_date, endDate: m.end_date
      })),
      gallery: []
    });
  }

  const endDate = new Date(activeMembership.end_date);
  const startDate = new Date(activeMembership.start_date);
  const today = new Date();
  const daysRemaining = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const progressPct = totalDays > 0 ? Math.min(100, Math.round(((totalDays - daysRemaining) / totalDays) * 100)) : 0;

  // Determine tier from membership type
  const monthMatch = (activeMembership.membership_type || '').match(/(\d+)/);
  const months = monthMatch ? parseInt(monthMatch[1]) : 3;
  const tier = months >= 12 ? 'Gold' : months >= 6 ? 'Silver' : 'Bronze';

  // Default perks by tier
  const defaultPerks = {
    Bronze: ['Studio Access', 'Dedicated Storage', 'Studio Glazes', '5% Discount'],
    Silver: ['Studio Access', 'Dedicated Storage', 'Studio Glazes', 'FREE $65 Firing Basket', '10% Discount'],
    Gold: ['Unlimited Studio Access', 'Free Dedicated Storage', 'Studio-Assisted Clay Reclaim', 'FREE $130 Firing Basket', 'All Studio Glazes Included', '10% Discount']
  };

  const perks = activeMembership.perks
    ? (typeof activeMembership.perks === 'object' ? Object.keys(activeMembership.perks) : activeMembership.perks)
    : defaultPerks[tier] || defaultPerks.Bronze;

  res.json({
    hasMembership: true,
    hasActiveEnrollments,
    membership: {
      id: activeMembership.id,
      type: activeMembership.membership_type,
      status: activeMembership.status,
      startDate: activeMembership.start_date,
      endDate: activeMembership.end_date,
      daysRemaining,
      totalDays,
      progressPct,
      tier,
      perks
    },
    history: allMemberships.map(m => ({
      id: m.id, type: m.membership_type, status: m.status,
      startDate: m.start_date, endDate: m.end_date
    })),
    gallery: (galleryPieces || []).slice(0, 6).map(p => ({
      id: p.id,
      title: p.title,
      imageUrl: p.images && p.images.length > 0 ? p.images[0] : null,
      dateCompleted: p.date_completed
    }))
  });
}));

};
