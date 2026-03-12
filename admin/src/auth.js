export function getAuthHeaders() {
  if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
    return { Authorization: 'Bearer dev-bypass' };
  }
  const token = sessionStorage.getItem('basil-token');
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function signInWithGoogle() {
  // Redirect to backend OAuth — pass redirect hint so callback sends us back to /admin
  window.location.href = '/auth/google?redirect=/admin';
}

export function signOut() {
  sessionStorage.removeItem('basil-token');
}

/**
 * Consume ?token= from URL after OAuth callback redirect.
 * @returns {boolean} true if a token was consumed
 */
export function consumeAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return false;

  sessionStorage.setItem('basil-token', token);

  params.delete('token');
  const clean = params.toString();
  const url = window.location.pathname + (clean ? `?${clean}` : '');
  window.history.replaceState({}, '', url);
  return true;
}
