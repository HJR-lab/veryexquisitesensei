import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-3xl font-bold uppercase tracking-tight mb-8">Welcome back, {user?.email?.split('@')[0] || 'Student'}!</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* My Classes Column */}
          <Link
            to="/my-classes"
            className="bg-background-alt border border-border p-8 hover:border-accent transition-colors group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent/10 flex items-center justify-center border border-border">
                <span className="material-symbols-outlined text-accent text-4xl">event</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold group-hover:text-accent transition-colors uppercase">My Classes</h3>
                <p className="text-text-muted">View and manage your class bookings</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-text-muted">Click to view your upcoming classes and schedule</p>
            </div>
          </Link>

          {/* My Gallery Column */}
          <Link
            to="/my-gallery"
            className="bg-background-alt border border-border p-8 hover:border-accent transition-colors group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent/10 flex items-center justify-center border border-border">
                <span className="material-symbols-outlined text-accent text-4xl">palette</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold group-hover:text-accent transition-colors uppercase">My Gallery</h3>
                <p className="text-text-muted">Manage your pottery pieces</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-text-muted">Click to view and edit your pottery collection</p>
            </div>
          </Link>
        </div>

        {/* Quick Links */}
        <div className="mt-12">
          <h3 className="text-xl font-bold uppercase mb-4">Quick Links</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              to="/classes"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">local_fire_department</span>
              <span className="text-sm font-medium uppercase">Browse Classes</span>
            </Link>
            <Link
              to="/membership"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">card_membership</span>
              <span className="text-sm font-medium uppercase">Membership</span>
            </Link>
            <Link
              to="/contact"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">contact_support</span>
              <span className="text-sm font-medium uppercase">Contact</span>
            </Link>
            <Link
              to="/"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">photo_library</span>
              <span className="text-sm font-medium uppercase">Public Gallery</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
