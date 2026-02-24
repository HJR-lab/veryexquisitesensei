import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../utils/api';
import { useState, useRef, useEffect } from 'react';

export default function Navigation() {
  const { user, logout, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [controlDropdownOpen, setControlDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  const navRef = useRef(null);
  const linksRef = useRef({});
  const dropdownRef = useRef(null);
  const userDropdownRef = useRef(null);

  const isActive = (path) => location.pathname === path;
  const isAdminPage = location.pathname.startsWith('/admin');
  const isImpersonating = user && user.impersonatedBy;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setControlDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize underline position on mount
  useEffect(() => {
    const initUnderline = () => {
      const activePath = location.pathname;
      const activeLink = linksRef.current[activePath];

      if (activeLink && navRef.current) {
        const navRect = navRef.current.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();

        setUnderlineStyle({
          left: linkRect.left - navRect.left,
          width: linkRect.width,
          opacity: 1
        });
        // Delay enabling transitions to allow initial position to render
        setTimeout(() => {
          setIsInitialized(true);
        }, 50);
      }
    };

    // Use requestAnimationFrame to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      initUnderline();
    });
  }, []);

  // Update underline position on navigation
  useEffect(() => {
    if (!isInitialized) return;

    const updateUnderline = () => {
      const activePath = location.pathname;
      const activeLink = linksRef.current[activePath];

      if (activeLink && navRef.current) {
        const navRect = navRef.current.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();

        setUnderlineStyle({
          left: linkRect.left - navRect.left,
          width: linkRect.width,
          opacity: 1
        });
      }
    };

    updateUnderline();
  }, [location.pathname, isInitialized]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const activePath = location.pathname;
      const activeLink = linksRef.current[activePath];

      if (activeLink && navRef.current) {
        const navRect = navRef.current.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();

        setUnderlineStyle({
          left: linkRect.left - navRect.left,
          width: linkRect.width,
          opacity: 1
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleReturnToAdmin = async () => {
    if (user && user.originalAdminToken) {
      try {
        console.log('🔙 Returning to admin view...');

        // Restore the original admin token
        localStorage.setItem('token', user.originalAdminToken);

        // Fetch the admin user data with the restored token
        const adminData = await authAPI.getMe();

        // Update the user context with admin data
        updateUser(adminData.user);

        // Navigate back to admin
        navigate('/admin/students');
      } catch (error) {
        console.error('Error returning to admin:', error);
        // If there's an error, reload the page as fallback
        window.location.reload();
      }
    }
  };

  return (
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 md:px-6">
        <div className="flex items-center justify-between h-12">
          {/* Mobile - Hamburger Menu */}
          <button
            className="md:hidden p-2 text-text"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>

          {/* Desktop - Navigation */}
          <nav ref={navRef} className="hidden md:flex items-center gap-3 relative">
            {isAdminPage ? (
              /* Admin Navigation */
              <>
                {/* Control Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setControlDropdownOpen(!controlDropdownOpen)}
                    className="text-sm font-normal uppercase tracking-wide relative pb-1 text-text-muted hover:text-text flex items-center gap-1"
                  >
                    Control
                    <span className="material-symbols-outlined text-sm">
                      {controlDropdownOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {controlDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-[60]">
                      <Link
                        to="/admin"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Dashboard
                      </Link>
                      <Link
                        to="/admin/students"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Students
                      </Link>
                      <Link
                        to="/admin/classes"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Classes
                      </Link>
                      <Link
                        to="/admin/courses"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Courses
                      </Link>
                      <Link
                        to="/admin/memberships"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Memberships
                      </Link>
                      <Link
                        to="/admin/gallery"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Gallery
                      </Link>
                      <Link
                        to="/admin/reference"
                        onClick={() => setControlDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Reference
                      </Link>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Member Navigation */
              <>
                <Link
                  ref={el => linksRef.current['/classes'] = el}
                  className={`text-sm font-normal uppercase tracking-wide relative pb-1 ${isActive('/classes') ? 'text-text' : 'text-text-muted hover:text-text'}`}
                  to="/classes"
                >
                  Classes
                </Link>
                <Link
                  ref={el => linksRef.current['/my-gallery'] = el}
                  className={`text-sm font-normal uppercase tracking-wide relative pb-1 ${isActive('/my-gallery') ? 'text-text' : 'text-text-muted hover:text-text'}`}
                  to="/my-gallery"
                >
                  Gallery
                </Link>
                <Link
                  ref={el => linksRef.current['/membership'] = el}
                  className={`text-sm font-normal uppercase tracking-wide relative pb-1 ${isActive('/membership') ? 'text-text' : 'text-text-muted hover:text-text'}`}
                  to="/membership"
                >
                  Membership
                </Link>
                <Link
                  ref={el => linksRef.current['/contact'] = el}
                  className={`text-sm font-normal uppercase tracking-wide relative pb-1 ${isActive('/contact') ? 'text-text' : 'text-text-muted hover:text-text'}`}
                  to="/contact"
                >
                  Contact
                </Link>
              </>
            )}
            <span
              className={`absolute bottom-0 h-0.5 bg-text ${isInitialized ? 'transition-all duration-300 ease-in-out' : ''}`}
              style={{
                left: `${underlineStyle.left}px`,
                width: `${underlineStyle.width}px`,
                visibility: underlineStyle.opacity > 0 ? 'visible' : 'hidden'
              }}
            />
          </nav>

          {/* Center - Logo */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <Link to="/" className="flex items-center text-text">
              <img
                src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
                alt="VES Pottery Studio"
                className="h-8 w-auto"
              />
            </Link>
          </div>

          {/* Right side - Auth buttons */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex gap-2 items-center">
              {isImpersonating && !isAdminPage && (
                <button
                  onClick={handleReturnToAdmin}
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-normal uppercase tracking-wide hover:bg-blue-200 transition-colors border border-blue-300 rounded flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                  <span>Return to Admin</span>
                </button>
              )}
              {!isAdminPage && user && !isImpersonating && (
                <Link
                  to="/admin"
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-normal uppercase tracking-wide hover:bg-blue-200 transition-colors border border-blue-300 rounded flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                  <span>Admin</span>
                </Link>
              )}
              {user ? (
                <div className="relative" ref={userDropdownRef}>
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="px-3 py-1 bg-gray-800 text-white text-sm font-normal uppercase tracking-wide hover:bg-gray-700 transition-colors border border-gray-800 flex items-center gap-1"
                  >
                    Hi {user.firstName || 'Member'}
                    <span className="material-symbols-outlined text-sm">
                      {userDropdownOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {userDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-[60]">
                      {!isAdminPage && (
                        <Link
                          to="/account"
                          onClick={() => setUserDropdownOpen(false)}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Account
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          logout();
                          setUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-3 py-1 bg-gray-800 text-white text-sm font-normal uppercase tracking-wide hover:bg-gray-700 transition-colors border border-gray-800"
                  >
                    Log In
                  </Link>
                  <Link
                    to="/register"
                    className="px-3 py-1 bg-background text-text text-sm font-normal uppercase tracking-wide hover:bg-background-alt transition-colors border border-text"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <nav className="flex flex-col space-y-4">
              {isAdminPage ? (
                /* Admin Mobile Navigation */
                <>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Control</div>
                    <div className="flex flex-col space-y-3 pl-2">
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin/students') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin/students"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Students
                      </Link>
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin/classes') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin/classes"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Classes
                      </Link>
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin/courses') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin/courses"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Courses
                      </Link>
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin/memberships') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin/memberships"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Memberships
                      </Link>
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin/gallery') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin/gallery"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Gallery
                      </Link>
                      <Link
                        className={`text-sm font-normal uppercase tracking-wide ${isActive('/admin/reference') ? 'text-text font-bold' : 'text-text-muted'}`}
                        to="/admin/reference"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Reference
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                /* Member Mobile Navigation */
                <>
                  {isImpersonating && (
                    <button
                      onClick={() => {
                        handleReturnToAdmin();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 bg-blue-100 text-blue-700 text-sm font-normal uppercase tracking-wide border border-blue-300 rounded flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                      <span>Return to Admin</span>
                    </button>
                  )}
                  <Link
                    className={`text-sm font-normal uppercase tracking-wide ${isActive('/classes') ? 'text-text font-bold' : 'text-text-muted'}`}
                    to="/classes"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Classes
                  </Link>
                  <Link
                    className={`text-sm font-normal uppercase tracking-wide ${isActive('/my-gallery') ? 'text-text font-bold' : 'text-text-muted'}`}
                    to="/my-gallery"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Gallery
                  </Link>
                  <Link
                    className={`text-sm font-normal uppercase tracking-wide ${isActive('/membership') ? 'text-text font-bold' : 'text-text-muted'}`}
                    to="/membership"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Membership
                  </Link>
                  <Link
                    className={`text-sm font-normal uppercase tracking-wide ${isActive('/contact') ? 'text-text font-bold' : 'text-text-muted'}`}
                    to="/contact"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Contact
                  </Link>
                </>
              )}
              <div className="pt-4 border-t border-border space-y-3">
                {user ? (
                  <>
                    <div className="text-sm font-medium text-gray-700 px-2">
                      Hi {user.firstName || 'Member'}
                    </div>
                    {!isAdminPage && (
                      <Link
                        to="/account"
                        className="block w-full px-6 py-2 bg-gray-100 text-gray-700 text-sm font-normal uppercase tracking-wide text-center border border-gray-300"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Account
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        logout();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-2 bg-gray-800 text-white text-sm font-normal uppercase tracking-wide border border-gray-800"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="block w-full px-6 py-2 bg-gray-800 text-white text-sm font-normal uppercase tracking-wide text-center border border-gray-800"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log In
                    </Link>
                    <Link
                      to="/register"
                      className="block w-full px-6 py-2 bg-background text-text text-sm font-normal uppercase tracking-wide text-center border border-text"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
