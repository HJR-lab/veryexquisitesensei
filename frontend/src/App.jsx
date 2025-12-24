import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AIChat from './components/AIChat';
import Login from './pages/Login';
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
              <PrivateRoute>
                <AdminDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/old"
            element={
              <PrivateRoute>
                <Admin />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/classes"
            element={
              <PrivateRoute>
                <AdminClasses />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/paused-students"
            element={
              <PrivateRoute>
                <AdminPausedStudents />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/courses"
            element={
              <PrivateRoute>
                <AdminCoursesNew />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <PrivateRoute>
                <AdminStudents />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/students/:email"
            element={
              <PrivateRoute>
                <AdminStudentDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/memberships"
            element={
              <PrivateRoute>
                <AdminMemberships />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/gallery"
            element={
              <PrivateRoute>
                <AdminGallery />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <PrivateRoute>
                <AdminClasses />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/reference"
            element={
              <PrivateRoute>
                <AdminReference />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <PrivateRoute>
                <AdminDashboard />
              </PrivateRoute>
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
