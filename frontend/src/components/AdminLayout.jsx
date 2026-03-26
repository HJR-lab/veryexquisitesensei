import { Outlet, useLocation } from 'react-router-dom';
import AdminNav from './AdminNav';

// Map path segments to nav active state
const getActiveNav = (pathname) => {
  if (pathname.includes('/admin/classes') || pathname.includes('/admin/courses')) return 'classes';
  if (pathname.includes('/admin/students') || pathname.includes('/admin/memberships')) return 'students';
  if (pathname.includes('/admin/studio-access')) return 'studio-access';
  if (pathname.includes('/admin/gallery')) return 'gallery';
  if (pathname.includes('/admin/instructors')) return 'instructors';
  if (pathname.includes('/admin/events')) return 'events';
  if (pathname.includes('/admin/reference')) return 'reference';
  if (pathname.includes('/admin/policy')) return 'policy';
  return 'dashboard';
};

export default function AdminLayout() {
  const location = useLocation();
  const active = getActiveNav(location.pathname);

  // Always clear impersonation when viewing admin pages
  if (localStorage.getItem('ves_impersonate_id')) {
    localStorage.removeItem('ves_impersonate_id');
    localStorage.removeItem('adminReturnPath');
  }

  return (
    <>
      <AdminNav active={active} />
      <Outlet />
    </>
  );
}
