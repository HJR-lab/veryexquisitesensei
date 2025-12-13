import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import PeriodFilter from '../components/PeriodFilter';
import api from '../utils/api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [activePeriod, setActivePeriod] = useState({ startDate: null, endDate: null, type: 'all' });

  useEffect(() => {
    loadStats();
  }, [activePeriod]);

  const loadStats = async () => {
    try {
      setLoading(true);

      // Build query params with period filter
      const params = {};
      if (activePeriod.startDate && activePeriod.endDate) {
        params.startDate = activePeriod.startDate;
        params.endDate = activePeriod.endDate;
      }

      // Load dashboard stats and reference data
      const [dashboardRes, clayTypesRes, glazesRes] = await Promise.all([
        api.get.'/admin/dashboard/stats', { params }),
        api.get.'/api/reference/clay-types'),
        api.get.'/api/reference/glazes')
      ]);

      setStats({
        ...dashboardRes.data,
        clayTypes: clayTypesRes.data.clayTypes?.length || 0,
        glazes: glazesRes.data.glazes?.length || 0
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (period) => {
    setActivePeriod(period);
  };

  const adminCards = [
    {
      title: 'Students',
      description: 'Manage students, allocations, and accounts',
      icon: 'group',
      path: '/admin/students',
      stat: stats?.students?.total,
      statLabel: 'Active Students',
      statDetails: [
        { label: 'New students', value: stats?.students?.newThisMonth },
        { label: 'Returning students', value: stats?.students?.returning }
      ]
    },
    {
      title: 'Course Schedule',
      description: 'Create and manage class instances',
      icon: 'event',
      path: '/admin/classes',
      stat: stats?.classes?.total,
      statLabel: 'Scheduled Classes',
      statDetails: [
        { label: 'Students enrolled', value: stats?.classes?.enrolled },
        { label: 'Available spots', value: stats?.classes?.availableSpots }
      ]
    },
    {
      title: 'Paused Students',
      description: 'View and manage students who have paused their courses',
      icon: 'pause_circle',
      path: '/admin/paused-students'
    },
    {
      title: 'Members',
      description: 'Manage studio memberships',
      icon: 'card_membership',
      path: '/admin/memberships',
      stat: stats?.memberships?.total,
      statLabel: 'Active Members',
      statDetails: [
        { label: 'Expiring soon', value: stats?.memberships?.expiringSoon },
        { label: 'Renewed this month', value: stats?.memberships?.renewedThisMonth }
      ]
    },
    {
      title: 'Gallery',
      description: 'View and manage all student pottery',
      icon: 'photo_library',
      path: '/admin/gallery',
      stat: stats?.gallery?.total,
      statLabel: 'Gallery Pieces',
      statDetails: [
        { label: 'Added this month', value: stats?.gallery?.addedThisMonth },
        { label: 'Awaiting approval', value: stats?.gallery?.awaitingApproval }
      ]
    },
    {
      title: 'Course Templates',
      description: 'Manage course templates and recurring classes',
      icon: 'school',
      path: '/admin/courses'
    },
    {
      title: 'Bookings & Attendance',
      description: 'View bookings and mark attendance',
      icon: 'fact_check',
      path: '/admin/bookings',
      stat: stats?.bookings?.total,
      statLabel: 'Total Bookings',
      statDetails: [
        { label: 'This week', value: stats?.bookings?.thisWeek },
        { label: 'Attendance rate', value: stats?.bookings?.attendanceRate ? `${stats.bookings.attendanceRate}%` : '--' }
      ]
    },
    {
      title: 'Reference Data',
      description: 'Manage clay types and glazes',
      icon: 'inventory_2',
      path: '/admin/reference',
      stat: (stats?.clayTypes || 0) + (stats?.glazes || 0),
      statLabel: 'Total Items',
      statDetails: [
        { label: 'Clay types', value: stats?.clayTypes },
        { label: 'Glazes', value: stats?.glazes }
      ]
    },
    {
      title: 'Analytics',
      description: 'View reports and statistics',
      icon: 'analytics',
      path: '/admin/analytics'
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-3 lg:px-4 py-4">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text mb-1">Admin Dashboard</h1>
              <p className="text-text-muted">VES Pottery Studio Management</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-2 py-1 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Period Filter */}
        <PeriodFilter onPeriodChange={handlePeriodChange} />

        {/* Top 4 Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {adminCards.filter(card => card.stat !== undefined).map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className="group bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-400 hover:shadow-md transition-all duration-200 text-left relative"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left Column: Icon + Title */}
                <div className="flex items-start gap-2 min-w-0">
                  <span className="material-symbols-outlined text-gray-700 text-xl flex-shrink-0">
                    {card.icon}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {card.title}
                    </h3>
                    <div
                      className="relative flex-shrink-0"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setHoveredCard(card.path);
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        setHoveredCard(null);
                      }}
                    >
                      <span className="material-symbols-outlined text-gray-400 text-sm cursor-help">
                        info
                      </span>
                      {hoveredCard === card.path && (
                        <div className="absolute left-0 top-5 z-10 w-56 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                          {card.description}
                          <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Stats */}
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-gray-900 mb-1">
                    {loading ? '--' : card.stat}
                  </p>
                  <p className="text-xs text-gray-600 mb-2">{card.statLabel}</p>
                  {card.statDetails && (
                    <div className="space-y-0.5">
                      {card.statDetails.map((detail, idx) => (
                        <div key={idx} className="text-xs text-gray-500">
                          <span className="font-semibold">{detail.value}</span> {detail.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Other Admin Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {adminCards.filter(card => card.stat === undefined).map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className="group bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-400 hover:shadow-md transition-all duration-200 text-left relative"
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-gray-700 text-xl flex-shrink-0">
                  {card.icon}
                </span>

                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {card.title}
                    </h3>
                    <div
                      className="relative flex-shrink-0"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setHoveredCard(card.path);
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        setHoveredCard(null);
                      }}
                    >
                      <span className="material-symbols-outlined text-gray-400 text-sm cursor-help">
                        info
                      </span>
                      {hoveredCard === card.path && (
                        <div className="absolute left-0 top-5 z-10 w-56 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                          {card.description}
                          <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center text-gray-700 mt-auto pt-1 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Open</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
