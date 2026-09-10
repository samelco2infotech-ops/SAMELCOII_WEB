/**
 * API Client for SAMELCII Node backend.
 * EDIT GUIDE: HTTPS uses Apache's same-origin node-api proxy; local HTTP may call Node directly.
 * HUWAG BAGUHIN: Never restore identity from unsigned browser session data.
 * Tagalog: JWT mula sa Node lang ang tunay na login.
 */

const APIClient = (() => {
  const getAppBase = () => {
    const origin = (window.location && window.location.origin && window.location.origin !== 'null')
      ? window.location.origin
      : `${window.location.protocol || 'http:'}//${window.location.hostname || 'localhost'}`;
    const pathname = String((window.location && window.location.pathname) || '');
    const marker = '/SAMELCII_WEB_SYSTEM';
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return `${origin}${pathname.slice(0, markerIndex + marker.length)}`;
    }
    return `${origin}/SAMELCII_WEB_SYSTEM`;
  };

  const getAuthUrl = () => `${getAppBase()}/pages/auth/index.html`;

  const getApiBase = () => `${getAppBase()}/api`;
  const getNodeApiBase = () => {
    if (window.SAMELCII_NODE_API_BASE) {
      return String(window.SAMELCII_NODE_API_BASE).replace(/\/+$/, '');
    }
    const hostname = window.location.hostname || '127.0.0.1';
    return window.location.protocol === 'https:'
      ? `${getAppBase()}/node-api`
      : `http://${hostname}:3000/api`;
  };

  const CONFIG = {
    API_BASE: getNodeApiBase(),
    API_BASE_FALLBACKS: [getNodeApiBase()],
    NODE_API_BASE: getNodeApiBase(),
    AUTH_BASE: `${getNodeApiBase()}/auth`,
    TOKEN_KEY: 'samelcii_token',
    USER_KEY: 'samelcii_user',
    REMEMBER_KEY: 'samelcii_remember',
    TOKEN_EXPIRY_WARNING: 60 * 60 * 1000,
  };

  const isJwtLike = (value) => typeof value === 'string' && value.split('.').length === 3;

  if (typeof window !== 'undefined') {
    window.SAMELCII_API_BASE = CONFIG.API_BASE;
    window.SAMELCII_NODE_API_BASE = CONFIG.NODE_API_BASE;
    window.SAMELCII_MEDIA_BASE = CONFIG.NODE_API_BASE.replace(/\/api$/, '');
    window.SAMELCII_RESOLVE_API_BASE = getNodeApiBase;
  }

  const resolveMediaUrl = (value) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.href);
      const action = String(parsed.searchParams.get('action') || '').toLowerCase();
      const legacyAuthPhoto = /\/api\/auth(?:\.php)?$/i.test(parsed.pathname) && action === 'profile_photo';
      const directAuthPhoto = /\/api\/auth\/profile-photo$/i.test(parsed.pathname);
      if (legacyAuthPhoto || directAuthPhoto) {
        const userId = parsed.searchParams.get('user_id') || parsed.searchParams.get('id') || '';
        if (/^\d+$/.test(userId) && Number(userId) > 0) {
          const version = parsed.searchParams.get('v');
          return `${CONFIG.AUTH_BASE}/profile-photo?user_id=${encodeURIComponent(userId)}${version ? `&v=${encodeURIComponent(version)}` : ''}`;
        }
      }
    } catch (_error) {
      // Continue with the normal media-path resolver.
    }
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/api/auth/')) {
      return `${CONFIG.NODE_API_BASE.replace(/\/api$/, '')}${raw}`;
    }

    const origin = (window.location && window.location.origin) || `${window.location.protocol || 'http:'}//${window.location.hostname || 'localhost'}`;
    const appBase = (() => {
      const pathname = String((window.location && window.location.pathname) || '');
      const marker = '/SAMELCII_WEB_SYSTEM';
      const markerIndex = pathname.indexOf(marker);
      return markerIndex >= 0 ? pathname.slice(0, markerIndex + marker.length) : '/SAMELCII_WEB_SYSTEM';
    })();

    const appBaseWithSlash = `${appBase.replace(/\/+$/, '')}/`;
    const originAppBaseWithSlash = `${origin}${appBaseWithSlash}`;
    const rawWithoutOrigin = raw.replace(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
    let clean = rawWithoutOrigin;

    if (clean.startsWith(originAppBaseWithSlash)) {
      clean = clean.slice(originAppBaseWithSlash.length);
    } else if (clean.startsWith(appBaseWithSlash)) {
      clean = clean.slice(appBaseWithSlash.length);
    }

    clean = clean.replace(/^\/+/, '');
    if (!clean) return '';

    clean = clean.replace(/^SAMELCII_WEB_SYSTEM\/+/, '');
    clean = clean.replace(/^uploads\//i, 'uploads/');
    if (!clean) return '';
    return `${window.SAMELCII_MEDIA_BASE}/${clean}`;
  };

  const normalizeUserMedia = (input) => {
    if (!input || typeof input !== 'object') return input;
    const next = { ...input };
    if (next.profile_photo_url) {
      next.profile_photo_url = resolveMediaUrl(next.profile_photo_url);
    }
    return next;
  };

  let token = localStorage.getItem(CONFIG.TOKEN_KEY);
  if (!isJwtLike(token)) {
    token = null;
    localStorage.removeItem(CONFIG.TOKEN_KEY);
  }

  let user = (() => {
    try {
      return normalizeUserMedia(JSON.parse(localStorage.getItem(CONFIG.USER_KEY)));
    } catch {
      return null;
    }
  })();

  let tokenExpiryTimer = null;
  let sessionRestorePromise = null;
  let sessionExpiredRedirecting = false;

  const isAuthPage = () => /\/pages\/auth\//i.test(String((window.location && window.location.pathname) || ''));

  const isSessionExpiredMessage = (message) => {
    const text = String(message || '').toLowerCase();
    return text.includes('please login first')
      || text.includes('invalid token')
      || text.includes('session expired')
      || text.includes('login again')
      || text.includes('unauthorized');
  };

  const handleSessionExpired = (message = 'Session expired. Please login again.') => {
    if (sessionExpiredRedirecting || isAuthPage()) return;
    sessionExpiredRedirecting = true;
    clearAuth();
    localStorage.removeItem('samelcii_session');
    window.location.href = getAuthUrl();
  };

  const fetchWithTimeout = async (url, options, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal, credentials: 'include' });
    } catch (error) {
      // ponytail: a busy machine can genuinely take a few seconds to hand a request to the
      // network stack; surfacing the raw AbortError ("signal is aborted without reason") reads
      // like a broken app instead of a slow one, so translate it into an actionable message.
      if (error && error.name === 'AbortError') {
        throw new Error('The server took too long to respond. Please check your connection and try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const parseJsonResponse = async (response, fallbackMessage = 'Invalid server response.') => {
    const payload = await response.json().catch(() => ({ ok: false, message: fallbackMessage }));
    if (response.status === 401 || isSessionExpiredMessage(payload.message)) {
      handleSessionExpired(payload.message || 'Session expired. Please login again.');
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || `API error: ${response.status}`);
    }
    return payload;
  };

  const authRequest = async (action, { method = 'POST', body = null, search = null, headers = {} } = {}) => {
    const routes = {
      login: '/login',
      register: '/register',
      reset_password: '/reset-password',
      search_employee: '/search-employee',
      upload_profile_photo: '/upload-profile-photo',
      me: '/me',
      logout: '/logout',
    };
    const route = routes[action];
    if (!route) {
      throw new Error('Invalid authentication action.');
    }
    const url = new URL(`${CONFIG.AUTH_BASE}${route}`);
    if (search && typeof search === 'object') {
      Object.entries(search).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }
    const response = await fetchWithTimeout(url.toString(), {
      method,
      headers: {
        ...(isJwtLike(token) ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body,
    });

    return parseJsonResponse(response);
  };

  const request = async (method, endpoint, data = null) => {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (isJwtLike(token)) {
      options.headers.Authorization = `Bearer ${token}`;
    }

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    let lastError = null;
    for (const baseUrl of CONFIG.API_BASE_FALLBACKS) {
      const url = `${baseUrl}${endpoint}`;
      try {
        const response = await fetchWithTimeout(url, options);
        const payload = await response.json().catch(() => ({ ok: false, message: 'Invalid server response.' }));

        if (response.status === 401 || isSessionExpiredMessage(payload.message)) {
          handleSessionExpired(payload.message || 'Your session has expired. Please login again.');
          throw new Error('Your session has expired. Please login again.');
        }

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || `API error: ${response.status}`);
        }

        return payload;
      } catch (error) {
        lastError = error;
      }
    }

    console.error('API Request failed:', lastError);
    throw lastError;
  };

  const login = async (username, password) => {
    const response = await authRequest('login', {
      body: new URLSearchParams({ username, password }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });

    if (response.user) {
      if (!isJwtLike(response.token)) {
        throw new Error('Login response missing a valid token.');
      }
      setAuth(response.token, response.user);
      setupTokenExpiryWarning();
      return response.user;
    }

    throw new Error('Login response missing user data.');
  };

  const register = async (usercode, username, password) => {
    return authRequest('register', {
      body: new URLSearchParams({ usercode, username, password }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });
  };

  const resetPassword = async (identifier, password) => {
    return authRequest('reset_password', {
      body: new URLSearchParams({ identifier, password }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });
  };

  const searchEmployees = async (query) => {
    const response = await authRequest('search_employee', {
      method: 'GET',
      search: { q: query },
    });
    return response.items || [];
  };

  const uploadProfilePhoto = async (file) => {
    const formData = new FormData();
    formData.append('file', file, (file && file.name) || 'profile-photo.jpg');

    const headers = isJwtLike(token)
      ? { Authorization: `Bearer ${token}` }
      : {};

    const response = await fetchWithTimeout(`${CONFIG.AUTH_BASE}/upload-profile-photo`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const payload = await response.json().catch(() => ({ ok: false, message: 'Invalid server response.' }));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || 'Upload failed.');
    }

    if (user) {
      user.profile_photo_url = resolveMediaUrl(payload.profile_photo_url);
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    }

    return payload;
  };

  const getCurrentUser = async () => {
    if (!isJwtLike(token)) {
      return null;
    }
    try {
      const response = await authRequest('me', { method: 'GET' });
      if (response.user) {
        user = normalizeUserMedia(response.user);
        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
        return user;
      }
    } catch {
      // Ignore and fall back to cached state.
    }
    return user;
  };

  const ensurePhpSession = async () => {
    if (sessionRestorePromise) {
      return sessionRestorePromise;
    }

    sessionRestorePromise = (async () => {
      return getCurrentUser();
    })();

    try {
      return await sessionRestorePromise;
    } finally {
      sessionRestorePromise = null;
    }
  };

  const logout = async () => {
    try {
      await authRequest('logout', {
        body: new URLSearchParams({}),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      });
    } catch {
      // Ignore logout errors.
    }
    localStorage.removeItem('samelcii_session');
    clearAuth();
  };

  const setAuth = (newToken, newUser) => {
    if (!newUser || typeof newUser !== 'object') {
      clearAuth();
      return;
    }

    if (!isJwtLike(newToken)) {
      clearAuth();
      return;
    }
    user = normalizeUserMedia(newUser);
    token = String(newToken);
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
  };

  const clearAuth = () => {
    token = null;
    user = null;
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    if (tokenExpiryTimer) {
      clearTimeout(tokenExpiryTimer);
      tokenExpiryTimer = null;
    }
  };

  const getToken = () => token;
  const isAuthenticated = () => !!token && !!user;
  const getUser = () => user;

  const setupTokenExpiryWarning = () => {
    if (tokenExpiryTimer) {
      clearTimeout(tokenExpiryTimer);
    }

    tokenExpiryTimer = setTimeout(() => {
      const message = 'Your session will expire in 1 hour. Please refresh the page or login again.';
      console.warn(message);

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Session Expiry Warning', { body: message });
      }
    }, 7 * 24 * 60 * 60 * 1000 - CONFIG.TOKEN_EXPIRY_WARNING);
  };

  const setupTokenExpiryOnLoad = () => {
    if (isAuthenticated()) {
      setupTokenExpiryWarning();
    }
  };

  return {
    CONFIG,
    resolveMediaUrl,
    login,
    register,
    resetPassword,
    logout,
    getCurrentUser,
    ensurePhpSession,
    searchEmployees,
    uploadProfilePhoto,
    setAuth,
    clearAuth,
    handleSessionExpired,
    isSessionExpiredMessage,
    getToken,
    isAuthenticated,
    getUser,
    setupTokenExpiryOnLoad,
    request,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  APIClient.setupTokenExpiryOnLoad();
});

(() => {
  const originalFetch = window.fetch;
  if (typeof originalFetch !== 'function' || originalFetch.__samelciiSessionWatch) return;
  let sessionValidationPromise = null;
  const validateSessionAfterUnauthorized = () => {
    if (sessionValidationPromise) return sessionValidationPromise;
    const token = typeof APIClient.getToken === 'function' ? APIClient.getToken() : null;
    if (!token || token.split('.').length !== 3) {
      if (typeof APIClient.handleSessionExpired === 'function') APIClient.handleSessionExpired('Session expired. Please login again.');
      return Promise.resolve();
    }
    sessionValidationPromise = originalFetch(`${APIClient.CONFIG.AUTH_BASE}/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      cache: 'no-store',
    }).then((response) => {
      if (response.status === 401) {
        if (typeof APIClient.handleSessionExpired === 'function') APIClient.handleSessionExpired('Session expired. Please login again.');
      }
    }).catch(() => {
      // A network failure is not proof that a valid session expired.
    }).finally(() => {
      sessionValidationPromise = null;
    });
    return sessionValidationPromise;
  };
  const watchedFetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = String((args[0] && args[0].url) || args[0] || '');
      const apiBase = String(window.SAMELCII_API_BASE || APIClient.CONFIG.API_BASE || '');
      if (!url.includes('/api/') && apiBase && !url.startsWith(apiBase)) {
        return response;
      }
      if (response.status === 401) {
        await validateSessionAfterUnauthorized();
        return response;
      }
      const contentType = response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '';
      if (contentType.includes('application/json')) {
        const payload = await response.clone().json().catch(() => null);
        const message = (payload && payload.message) || (payload && payload.error) || '';
        if (message && typeof APIClient.isSessionExpiredMessage === 'function' && APIClient.isSessionExpiredMessage(message)) {
          APIClient.handleSessionExpired(message);
        }
      }
    } catch (_error) {
      // ponytail: fetch watcher must never break the real request flow.
    }
    return response;
  };
  watchedFetch.__samelciiSessionWatch = true;
  window.fetch = watchedFetch;
})();
