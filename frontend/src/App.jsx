import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { lazy, Suspense, useState } from 'react';
import PolicyPopup from './components/PolicyPopup';
import ErrorBoundary from './components/ErrorBoundary';
import AdminLayout from './components/AdminLayout';
import StudentLayout from './components/StudentLayout';

// Critical path — loaded eagerly (student landing pages)
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import PublicGallery from './pages/PublicGallery';
import GalleryNew from './pages/GalleryNew';
import ClassScheduleNew from './pages/ClassScheduleNew';
import Account from './pages/Account';

// Lazy load everything else
const Gallery = lazy(() => import('./pages/Gallery'));
const AdminCoursesNew = lazy(() => import('./pages/AdminCoursesNew'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const UtilityDashboard = lazy(() => import('./pages/UtilityDashboard'));
const AdminStudents = lazy(() => import('./pages/AdminStudents'));
const AdminStudentDetail = lazy(() => import('./pages/AdminStudentDetail'));
const AdminMemberships = lazy(() => import('./pages/AdminMemberships'));
const AdminGallery = lazy(() => import('./pages/AdminGallery'));
const AdminReference = lazy(() => import('./pages/AdminReference'));
const AdminClasses = lazy(() => import('./pages/AdminClasses'));
const AdminPausedStudents = lazy(() => import('./pages/AdminPausedStudents'));
const AdminStudioPolicy = lazy(() => import('./pages/AdminStudioPolicy'));
const AdminEvents = lazy(() => import('./pages/AdminEvents'));
const AdminInstructors = lazy(() => import('./pages/AdminInstructors'));
const UploadPiece = lazy(() => import('./pages/UploadPiece'));
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'));
const InstructorDashboard = lazy(() => import('./pages/InstructorDashboard'));
const Membership = lazy(() => import('./pages/Membership'));
const StudioPolicy = lazy(() => import('./pages/StudioPolicy'));
const InstructorProfile = lazy(() => import('./pages/InstructorProfile'));
const InstructorPortfolio = lazy(() => import('./pages/InstructorPortfolio'));
const Contact = lazy(() => import('./pages/Contact'));
const StudioAccess = lazy(() => import('./pages/StudioAccess'));
const Credits = lazy(() => import('./pages/Credits'));
const AdminStudioAccess = lazy(() => import('./pages/AdminStudioAccess'));
const AdminEmails = lazy(() => import('./pages/AdminEmails'));
const AdminCRM = lazy(() => import('./pages/AdminCRM'));
const AdminInbox = lazy(() => import('./pages/AdminInbox'));
const AdminCourseConfig = lazy(() => import('./pages/AdminCourseConfig'));
const AdminPlatformStats = lazy(() => import('./pages/AdminPlatformStats'));
const AdminPiecePipeline = lazy(() => import('./pages/AdminPiecePipeline'));
const AdminCredits = lazy(() => import('./pages/AdminCredits'));
const AdminReschedules = lazy(() => import('./pages/AdminReschedules'));
const AdminCohorts = lazy(() => import('./pages/AdminCohorts'));
const AdminFees = lazy(() => import('./pages/AdminFees'));
const AdminVouchers = lazy(() => import('./pages/AdminVouchers'));

const Policies = lazy(() => import('./pages/Policies'));
const EventRSVP = lazy(() => import('./pages/EventRSVP'));
const StudentDetailsForm = lazy(() => import('./pages/StudentDetailsForm'));

// Test pages — lazy loaded
const TestDash = lazy(() => import('./test-pages/TestDash'));
const TestClasses = lazy(() => import('./test-pages/TestClasses'));
const TestGallery = lazy(() => import('./test-pages/TestGallery'));
const TestAccount = lazy(() => import('./test-pages/TestAccount'));
const TestMembership = lazy(() => import('./test-pages/TestMembership'));
const TestAdminDash = lazy(() => import('./test-pages/TestAdminDash'));
const TestAdminStudents = lazy(() => import('./test-pages/TestAdminStudents'));
const TestAdminStudentDetail = lazy(() => import('./test-pages/TestAdminStudentDetail'));
const TestAdminClasses = lazy(() => import('./test-pages/TestAdminClasses'));
const TestAdminMemberships = lazy(() => import('./test-pages/TestAdminMemberships'));

// Shared loading fallback
const PageLoader = () => (
  <div className="loading-screen">
    <div className="spinner"></div>
  </div>
);

function PrivateRoute({ children }) {
  const { user, loading, refreshUser } = useAuth();
  const [policiesJustAccepted, setPoliciesJustAccepted] = useState(false);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  // Show policy popup for users who haven't accepted yet (skip for admins and impersonation)
  if (!user.policiesAcceptedAt && !policiesJustAccepted && !user.isAdmin && !user.isImpersonating) {
    return (
      <>
        {children}
        <PolicyPopup onAccepted={() => {
          setPoliciesJustAccepted(true);
          if (refreshUser) refreshUser();
        }} />
      </>
    );
  }

  return children;
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
  if (user.role === 'instructor') return <Suspense fallback={<PageLoader />}><InstructorDashboard /></Suspense>;
  return <Dashboard />;
}

function DashboardRoute() {
  const { user } = useAuth();
  return user?.role === 'instructor' ? <Suspense fallback={<PageLoader />}><InstructorDashboard /></Suspense> : <Dashboard />;
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/public-gallery" element={<PublicGallery />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/instructor/:id" element={<InstructorProfile />} />
          <Route path="/instructor/:id/portfolio" element={<InstructorPortfolio />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/events/:eventId/rsvp" element={<EventRSVP />} />
          <Route path="/student-details/:token" element={<StudentDetailsForm />} />

          {/* Instructor routes — no StudentLayout, uses own bottom nav */}
          <Route path="/my-classes" element={<PrivateRoute><Suspense fallback={<PageLoader />}><InstructorDashboard /></Suspense></PrivateRoute>} />
          <Route path="/my-portfolio" element={<PrivateRoute><Suspense fallback={<PageLoader />}><InstructorPortfolio /></Suspense></PrivateRoute>} />

          {/* Student routes — persistent bottom nav via StudentLayout */}
          <Route element={<PrivateRoute><StudentLayout /></PrivateRoute>}>
            <Route path="/gallery" element={<GalleryNew />} />
            <Route path="/gallery-old" element={<Gallery />} />
            <Route path="/classes" element={<ClassScheduleNew />} />
            <Route path="/upload" element={<UploadPiece />} />
            <Route path="/member" element={<MemberDashboard />} />
            <Route path="/membership" element={<Membership />} />
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/account" element={<Account />} />
            <Route path="/studio-access" element={<StudioAccess />} />
            <Route path="/credits" element={<Credits />} />
            <Route path="/policy" element={<StudioPolicy />} />
          </Route>

          {/* Admin routes — persistent nav via AdminLayout */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="utility" element={<UtilityDashboard />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="students/paused" element={<AdminPausedStudents />} />
            <Route path="students/:email" element={<AdminStudentDetail />} />
            <Route path="memberships" element={<AdminMemberships />} />
            <Route path="gallery" element={<AdminGallery />} />
            <Route path="reference" element={<AdminReference />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="courses" element={<AdminCoursesNew />} />
            <Route path="policy" element={<AdminStudioPolicy />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="instructors" element={<AdminInstructors />} />
            <Route path="studio-access" element={<AdminStudioAccess />} />
            <Route path="emails" element={<AdminEmails />} />
            <Route path="crm" element={<AdminCRM />} />
            <Route path="inbox" element={<AdminInbox />} />
            <Route path="course-config" element={<AdminCourseConfig />} />
            <Route path="platform-stats" element={<AdminPlatformStats />} />
            <Route path="pieces" element={<AdminPiecePipeline />} />
            <Route path="credits" element={<AdminCredits />} />
            <Route path="reschedules" element={<AdminReschedules />} />
            <Route path="cohorts" element={<AdminCohorts />} />
            <Route path="fees" element={<AdminFees />} />
            <Route path="vouchers" element={<AdminVouchers />} />

          </Route>

          {/* Test routes */}
          <Route path="/test" element={<PrivateRoute><TestDash /></PrivateRoute>} />
          <Route path="/test/classes" element={<PrivateRoute><TestClasses /></PrivateRoute>} />
          <Route path="/test/gallery" element={<PrivateRoute><TestGallery /></PrivateRoute>} />
          <Route path="/test/account" element={<PrivateRoute><TestAccount /></PrivateRoute>} />
          <Route path="/test/membership" element={<PrivateRoute><TestMembership /></PrivateRoute>} />
          <Route path="/test/admin" element={<AdminRoute><TestAdminDash /></AdminRoute>} />
          <Route path="/test/admin/students" element={<AdminRoute><TestAdminStudents /></AdminRoute>} />
          <Route path="/test/admin/students/:email" element={<AdminRoute><TestAdminStudentDetail /></AdminRoute>} />
          <Route path="/test/admin/classes" element={<AdminRoute><TestAdminClasses /></AdminRoute>} />
          <Route path="/test/admin/memberships" element={<AdminRoute><TestAdminMemberships /></AdminRoute>} />

          <Route path="/" element={<HomeRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
