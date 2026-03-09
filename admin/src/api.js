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

  return res.json();
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

/** Check if the current user is an admin by fetching /api/users (admin-only) */
export async function checkAdmin() {
  try {
    await request('/api/users');
    return true;
  } catch {
    return false;
  }
}
