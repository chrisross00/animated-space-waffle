const TOKEN_KEY = 'basil-admin-token';

export function getAuthHeaders() {
  if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
    return { Authorization: 'Bearer dev-bypass' };
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function signInWithGoogle() {
  // In production, OAuth lives on the main domain — redirect back to admin subdomain
  const isDev = import.meta.env.DEV;
  if (isDev) {
    window.location.href = '/auth/google?redirect=/admin';
  } else {
    const adminOrigin = window.location.origin; // https://admin.basilbudgeting.com
    window.location.href = `https://basilbudgeting.com/auth/google?redirect=${encodeURIComponent(adminOrigin)}`;
  }
}

export function signOut() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Consume ?token= from URL after OAuth callback redirect.
 * @returns {boolean} true if a token was consumed
 */
export function consumeAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return false;

  localStorage.setItem(TOKEN_KEY, token);

  params.delete('token');
  const clean = params.toString();
  const url = window.location.pathname + (clean ? `?${clean}` : '');
  window.history.replaceState({}, '', url);
  return true;
}
