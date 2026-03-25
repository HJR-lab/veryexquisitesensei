import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
// import AIChat from './components/AIChat'; // Removed for security review

import AuthCallback from './pages/AuthCallback';
import Gallery from './pages/Gallery';
import GalleryNew from './pages/GalleryNew';
import ClassScheduleNew from './pages/ClassScheduleNew';
import AdminCoursesNew from './pages/AdminCoursesNew';
import Admin from './pages/Admin';
import AdminDashboard from './pages/AdminDashboard';
import UtilityDashboard from './pages/UtilityDashboard';
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
import StudioAccess from './pages/StudioAccess';
import AdminStudioAccess from './pages/AdminStudioAccess';

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
    return <Navigate to="/login" />;
  }

  // Allow access if user is admin OR if impersonating
  const isAdminOrImpersonating = user.isAdmin || user.isImpersonating || user.impersonatedBy;

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
        {/* <AIChat /> */}
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
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
            path="/admin/doe-dashboard"
            element={
              <AdminRoute>
                <UtilityDashboard />
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
            element={<Navigate to="/admin/students" replace />}
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
            path="/admin/studio-access"
            element={
              <AdminRoute>
                <AdminStudioAccess />
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
          <Route path="/studio-access" element={
            <PrivateRoute>
              <StudioAccess />
            </PrivateRoute>
          } />
          <Route path="/account" element={
            <PrivateRoute>
              <Account />
            </PrivateRoute>
          } />

          {/* ── Test pages — student (admin only) ── */}
          <Route path="/test/dashboard"   element={<AdminRoute><TestDash /></AdminRoute>} />
          <Route path="/test/classes"     element={<AdminRoute><TestClasses /></AdminRoute>} />
          <Route path="/test/gallery"     element={<AdminRoute><TestGallery /></AdminRoute>} />
          <Route path="/test/account"     element={<AdminRoute><TestAccount /></AdminRoute>} />
          <Route path="/test/membership"  element={<AdminRoute><TestMembership /></AdminRoute>} />

          {/* ── Test pages — admin ── */}
          <Route path="/test/admin"                    element={<AdminRoute><TestAdminDash /></AdminRoute>} />
          <Route path="/test/admin/students"           element={<AdminRoute><TestAdminStudents /></AdminRoute>} />
          <Route path="/test/admin/students/detail"    element={<AdminRoute><TestAdminStudentDetail /></AdminRoute>} />
          <Route path="/test/admin/classes"            element={<AdminRoute><TestAdminClasses /></AdminRoute>} />
          <Route path="/test/admin/memberships"        element={<AdminRoute><TestAdminMemberships /></AdminRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
