import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AIChat from './components/AIChat';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import SetupPassword from './pages/SetupPassword';
import Gallery from './pages/Gallery';
import GalleryNew from './pages/GalleryNew';
import ClassScheduleNew from './pages/ClassScheduleNew';
import AdminCoursesNew from './pages/AdminCoursesNew';
import Admin from './pages/Admin';
import AdminDashboard from './pages/AdminDashboard';
import AdminStudents from './pages/AdminStudents';
import AdminStudentDetail from './pages/AdminStudentDetail';
import AdminMemberships from './pages/AdminMemberships';
import AdminGallery from './pages/AdminGallery';
import AdminReference from './pages/AdminReference';
import AdminClasses from './pages/AdminClasses';
import AdminPausedStudents from './pages/AdminPausedStudents';
import AdminStudioPolicy from './pages/AdminStudioPolicy';
import AdminEvents from './pages/AdminEvents';
import AdminInstructors from './pages/AdminInstructors';
import UploadPiece from './pages/UploadPiece';
import PublicGallery from './pages/PublicGallery';
import Dashboard from './pages/Dashboard';
import MemberDashboard from './pages/MemberDashboard';
import InstructorDashboard from './pages/InstructorDashboard';
import Membership from './pages/Membership';
import StudioPolicy from './pages/StudioPolicy';
import InstructorProfile from './pages/InstructorProfile';
import InstructorPortfolio from './pages/InstructorPortfolio';
import TestDash from './test-pages/TestDash';
import TestClasses from './test-pages/TestClasses';
import TestGallery from './test-pages/TestGallery';
import TestAccount from './test-pages/TestAccount';
import TestMembership from './test-pages/TestMembership';
import TestAdminDash from './test-pages/TestAdminDash';
import TestAdminStudents from './test-pages/TestAdminStudents';
import TestAdminStudentDetail from './test-pages/TestAdminStudentDetail';
import TestAdminClasses from './test-pages/TestAdminClasses';
import TestAdminMemberships from './test-pages/TestAdminMemberships';
import Contact from './pages/Contact';
import Account from './pages/Account';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  // If in an impersonated session accessing admin routes, restore the admin token
  // so subsequent API calls (like re-impersonating) use the admin token
  useEffect(() => {
    if (user && user.originalAdminToken && !user.isAdmin) {
      localStorage.setItem('token', user.originalAdminToken);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // If not logged in, redirect to admin login
  if (!user) {
    return <Navigate to="/admin/login" />;
  }

  // Allow access if user is admin OR if impersonating (has originalAdminToken)
  const isAdminOrImpersonating = user.isAdmin || user.originalAdminToken || user.impersonatedBy;

  // If logged in but not admin and not impersonating, redirect to student gallery
  if (!isAdminOrImpersonating) {
    return <Navigate to="/gallery" />;
  }

  // User is admin or impersonating, allow access
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return user ? <Navigate to="/gallery" /> : children;
}

function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return <PublicGallery />;
  if (user.role === 'instructor') return <InstructorDashboard />;
  return <Dashboard />;
}

function DashboardRoute() {
  const { user } = useAuth();
  return user?.role === 'instructor' ? <InstructorDashboard /> : <Dashboard />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AIChat />
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/admin/login"
            element={
              <PublicRoute>
                <AdminLogin />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/verify-email"
            element={
              <PublicRoute>
                <VerifyEmail />
              </PublicRoute>
            }
          />
          <Route path="/setup-password" element={<SetupPassword />} />
          <Route
            path="/gallery"
            element={
              <PrivateRoute>
                <GalleryNew />
              </PrivateRoute>
            }
          />
          <Route
            path="/gallery-old"
            element={
              <PrivateRoute>
                <Gallery />
              </PrivateRoute>
            }
          />
          <Route
            path="/classes"
            element={<ClassScheduleNew />}
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/old"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/classes"
            element={
              <AdminRoute>
                <AdminClasses />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/paused-students"
            element={
              <AdminRoute>
                <AdminPausedStudents />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/courses"
            element={
              <AdminRoute>
                <AdminCoursesNew />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <AdminRoute>
                <AdminStudents />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/students/:email"
            element={
              <AdminRoute>
                <AdminStudentDetail />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/memberships"
            element={
              <AdminRoute>
                <AdminMemberships />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/policy"
            element={
              <AdminRoute>
                <AdminStudioPolicy />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/instructors"
            element={
              <AdminRoute>
                <AdminInstructors />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/events"
            element={
              <AdminRoute>
                <AdminEvents />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/gallery"
            element={
              <AdminRoute>
                <AdminGallery />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <AdminRoute>
                <AdminClasses />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reference"
            element={
              <AdminRoute>
                <AdminReference />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <PrivateRoute>
                <UploadPiece />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <DashboardRoute />
            </PrivateRoute>
          } />
          <Route path="/my-gallery" element={
            <PrivateRoute>
              <GalleryNew />
            </PrivateRoute>
          } />
          <Route path="/my-classes" element={
            <PrivateRoute>
              <ClassScheduleNew />
            </PrivateRoute>
          } />
          <Route path="/member" element={
            <PrivateRoute>
              <MemberDashboard />
            </PrivateRoute>
          } />
          <Route path="/membership" element={<Membership />} />
          <Route path="/studio-policy" element={<StudioPolicy />} />
          <Route path="/community/:id" element={<InstructorProfile />} />
          <Route path="/my-portfolio" element={
            <PrivateRoute>
              <InstructorPortfolio />
            </PrivateRoute>
          } />
          <Route path="/contact" element={<Contact />} />
          <Route path="/account" element={
            <PrivateRoute>
              <Account />
            </PrivateRoute>
          } />

          {/* ── Test pages — student (no auth required) ── */}
          <Route path="/test/dashboard"   element={<TestDash />} />
          <Route path="/test/classes"     element={<TestClasses />} />
          <Route path="/test/gallery"     element={<TestGallery />} />
          <Route path="/test/account"     element={<TestAccount />} />
          <Route path="/test/membership"  element={<TestMembership />} />

          {/* ── Test pages — admin ── */}
          <Route path="/test/admin"                    element={<TestAdminDash />} />
          <Route path="/test/admin/students"           element={<TestAdminStudents />} />
          <Route path="/test/admin/students/detail"    element={<TestAdminStudentDetail />} />
          <Route path="/test/admin/classes"            element={<TestAdminClasses />} />
          <Route path="/test/admin/memberships"        element={<TestAdminMemberships />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
