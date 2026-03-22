import { getAuthHeaders } from './auth';

async function request(path, options = {}) {
  const headers = await getAuthHeaders();
  if (!headers) throw new Error('Not authenticated');

  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }

  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export function getPersonas() {
  return request('/admin/personas');
}

export function getTestUsers() {
  return request('/admin/test-users');
}

export function seedTestUser(persona) {
  return request('/admin/seed-test-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  });
}

export function nukeTestUsers({ dryRun = false } = {}) {
  return request('/admin/nuke-test-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  });
}

export function createLoginToken(userId) {
  return request('/admin/login-as', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

/** Fetch the current user's profile from the backend. */
export function fetchCurrentUser() {
  return request('/api/getOrAddUser');
}

/** Check if the current user is an admin by fetching /api/users (admin-only) */
export async function checkAdmin() {
  try {
    await request('/api/users');
    return true;
  } catch {
    return false;
  }
}

// ── Toolbox API ──────────────────────────────────────────────

export function fetchUsers() {
  return request('/api/users');
}

// GET tools — targetUserId as query param
function toolGet(path, targetUserId) {
  const url = targetUserId ? `${path}?targetUserId=${targetUserId}` : path;
  return request(url);
}

// POST tools — targetUserId in body
function toolPost(path, targetUserId) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(targetUserId ? { targetUserId } : {}),
  });
}

export function addPlaidPfc(targetUserId) { return toolGet('/api/addplaidpfc', targetUserId); }
export function seedCategories(targetUserId) { return toolGet('/api/seedcategories', targetUserId); }
export function mapUnmapped(targetUserId) { return toolGet('/api/mapunmapped', targetUserId); }
export function dedupe(targetUserId) { return toolPost('/api/dedupe', targetUserId); }
export function cleanPending(targetUserId) { return toolGet('/api/cleanPendingTransactions', targetUserId); }
export function addVenmoTransactions(targetUserId) { return toolPost('/api/addVenmoTransactions', targetUserId); }
export function addTestTransactions(targetUserId) { return toolPost('/api/addTestTransactions', targetUserId); }
export function resetBalanceSnapshots(targetUserId) { return toolPost('/api/resetBalanceSnapshots', targetUserId); }
export function clearVenmoEnrichment(targetUserId) { return toolPost('/api/clearVenmoEnrichment', targetUserId); }
export function clearManualOverrides(targetUserId) { return toolPost('/api/clearManualOverrides', targetUserId); }
export function nukeTransactions(targetUserId) { return toolPost('/api/nukeTransactions', targetUserId); }
export function nukeAllData(targetUserId) { return toolPost('/api/nukeAllData', targetUserId); }

// Whitelist management
export function fetchAllowedEmails() { return request('/api/allowedEmails'); }
export function addAllowedEmail(email) {
  return request('/api/allowedEmails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}
export function deleteAllowedEmail(email) {
  return request('/api/deleteAllowedEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export function sandboxResetLogin(institution) {
  return request('/plaid-api/sandbox_reset_login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution }),
  });
}
