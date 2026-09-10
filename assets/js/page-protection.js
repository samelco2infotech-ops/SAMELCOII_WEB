/**
 * Page Protection - Ensures only authenticated users can access protected pages
 */

const PageProtection = (() => {
  const getAppBase = () => {
    const origin = (window.location && window.location.origin) || `${window.location.protocol || 'http:'}//${window.location.hostname || 'localhost'}`;
    const pathname = String((window.location && window.location.pathname) || '');
    const marker = '/SAMELCII_WEB_SYSTEM';
    const markerIndex = pathname.indexOf(marker);
    return markerIndex >= 0
      ? `${origin}${pathname.slice(0, markerIndex + marker.length)}`
      : `${origin}/SAMELCII_WEB_SYSTEM`;
  };
  const getAuthUrl = () => `${getAppBase()}/pages/auth/index.html`;
  const getDashboardUrl = () => `${getAppBase()}/pages/dashboard/index.html`;
  const resolveMediaUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (window.APIClient && typeof window.APIClient.resolveMediaUrl === 'function') {
      return window.APIClient.resolveMediaUrl(raw);
    }
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    let clean = raw.replace(/^\/+/, '');
    clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/i, '');
    clean = clean.replace(/^uploads\//i, 'uploads/');
    if (!clean) return '';
    const base = window.SAMELCII_MEDIA_BASE || `${window.location.origin}/SAMELCII_WEB_SYSTEM`;
    return `${base}/${clean}`;
  };

  const getDefaultAvatarUrl = (user = {}) => {
    const genderValue = String(user.gender || user.sex || '').trim().toLowerCase();
    const base = window.SAMELCII_MEDIA_BASE || `${window.location.origin}/SAMELCII_WEB_SYSTEM`;
    const version = '20260615-avatar-small-v2';

    if (/^(f|female|girl|woman)$/.test(genderValue)) {
      return `${base}/assets/images/avatar-female.jpg?v=${version}`;
    }

    if (/^(m|male|boy|man)$/.test(genderValue)) {
      return `${base}/assets/images/avatar-male.jpg?v=${version}`;
    }

    const userId = parseInt(user.id || user.Id || 0, 10);
    return `${base}/assets/images/${userId > 0 && userId % 2 === 0 ? 'avatar-male.jpg' : 'avatar-female.jpg'}?v=${version}`;
  };

  /**
   * Require authentication to access a page
   * Redirects to login if not authenticated
   */
  const requireAuth = () => {
    if (!APIClient.isAuthenticated()) {
      localStorage.setItem('redirectAfterLogin', window.location.href);
      window.location.href = getAuthUrl();
      return false;
    }
    return true;
  };

  /**
   * Require specific privilege level
   */
  const requirePrivilege = (minLevel) => {
    if (!requireAuth()) {
      return false;
    }

    const user = APIClient.getUser();
    const userPrivilege = parseInt((user && user.privilage) || 0, 10);

    if (userPrivilege < minLevel) {
      alert('You do not have permission to access this page.');
      window.location.href = getDashboardUrl();
      return false;
    }

    return true;
  };

  /**
   * Load user data on protected page
   */
  const loadUserData = async () => {
    if (!requireAuth()) {
      return null;
    }

    try {
      const freshUser = await ((typeof APIClient.ensurePhpSession === 'function' && APIClient.ensurePhpSession()) || APIClient.getCurrentUser());
      if (freshUser) {
        return freshUser;
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }

    return APIClient.getUser();
  };

  /**
   * Redirect after login
   */
  const redirectAfterLogin = () => {
    const redirectPath = localStorage.getItem('redirectAfterLogin');
    localStorage.removeItem('redirectAfterLogin');

    const redirectUrl = redirectPath ? new URL(redirectPath, window.location.href) : null;
    if (redirectUrl && !/\/pages\/auth\//i.test(redirectUrl.pathname)) {
      window.location.href = redirectPath;
    } else {
      window.location.href = getDashboardUrl();
    }
  };

  /**
   * Setup logout button
   */
  const setupLogoutButton = (buttonSelector = '.logout-btn') => {
    const logoutBtn = document.querySelector(buttonSelector);
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await APIClient.logout();
        localStorage.removeItem('samelcii_legacy_login');
        window.location.href = getAuthUrl();
      });
    }
  };

  /**
   * Display user info
   */
  const displayUserInfo = (user = APIClient.getUser()) => {
    if (!user) return;

    // Update user name if element exists
    const userNameEl = document.querySelector('[data-user-name]');
    if (userNameEl) {
      userNameEl.textContent = user.name || user.username || 'User';
    }

    // Update user avatar if element exists
    const userAvatarEl = document.querySelector('[data-user-avatar]');
    if (userAvatarEl) {
      userAvatarEl.src = resolveMediaUrl(user.profile_photo_url || getDefaultAvatarUrl(user));
      userAvatarEl.alt = user.name || 'User';
    }

    // Update user position if element exists
    const userPositionEl = document.querySelector('[data-user-position]');
    if (userPositionEl) {
      userPositionEl.textContent = user.position || '';
    }

    // Update user department if element exists
    const userDepartmentEl = document.querySelector('[data-user-department]');
    if (userDepartmentEl) {
      userDepartmentEl.textContent = user.department || '';
    }
  };

  /**
   * Setup page on load
   */
  const setupPage = async (options = {}) => {
    const {
      requiresAuth = true,
      minPrivilege = 0,
      logoutButtonSelector = '.logout-btn',
      displayUserInfo: shouldDisplayUserInfo = true,
    } = options;

    // Check authentication
    if (requiresAuth) {
      if (!requireAuth()) {
        return;
      }

      if (minPrivilege > 0 && !requirePrivilege(minPrivilege)) {
        return;
      }
    }

    // Load and display user data
    if (shouldDisplayUserInfo) {
      const user = await loadUserData();
      displayUserInfo(user);
    }

    // Setup logout button
    setupLogoutButton(logoutButtonSelector);
  };

  // Public API
  return {
    requireAuth,
    requirePrivilege,
    loadUserData,
    redirectAfterLogin,
    setupLogoutButton,
    displayUserInfo,
    setupPage,
  };
})();

// Auto-setup on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Only auto-setup if data-page-protection attribute is present
  const body = document.querySelector('body');
  if (body && body.hasAttribute('data-page-protection')) {
    const requiresAuth = body.getAttribute('data-require-auth') !== 'false';
    const minPrivilege = parseInt(body.getAttribute('data-min-privilege') || '0', 10);

    PageProtection.setupPage({
      requiresAuth,
      minPrivilege,
    });
  }
});
