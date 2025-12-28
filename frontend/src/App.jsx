import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AIChat from './components/AIChat';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
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
import UploadPiece from './pages/UploadPiece';
import PublicGallery from './pages/PublicGallery';
import Dashboard from './pages/Dashboard';
import Membership from './pages/Membership';
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

  // If logged in but not admin, redirect to student gallery
  if (!user.isAdmin) {
    return <Navigate to="/gallery" />;
  }

  // User is admin, allow access
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

  return user ? <Dashboard /> : <PublicGallery />;
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
          <Route path="/membership" element={<Membership />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/account" element={
            <PrivateRoute>
              <Account />
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
