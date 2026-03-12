const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// In-memory store for impersonation tokens.
// Map<token, { userId, expiresAt }>
const _impersonationTokens = new Map();
const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of _impersonationTokens) {
    if (data.expiresAt < now) _impersonationTokens.delete(token);
  }
}, 5 * 60 * 1000);

/**
 * Create a short-lived impersonation token for a target user.
 * Admin-only — caller must verify admin status before calling.
 * @returns {{ token: string, expiresAt: number }}
 */
function createImpersonationToken(targetUserId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + IMPERSONATION_TTL_MS;
  _impersonationTokens.set(token, { userId: targetUserId, expiresAt });
  return { token, expiresAt };
}

async function validateIdToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const idToken = header.split('Bearer ')[1];

  // Dev auth bypass — only active when DEV_AUTH_BYPASS_UID is set and not in production
  if (
    process.env.DEV_AUTH_BYPASS_UID &&
    process.env.NODE_ENV !== 'production' &&
    idToken === 'dev-bypass'
  ) {
    return { uid: process.env.DEV_AUTH_BYPASS_UID };
  }

  // Impersonation token — issued by admin portal, not in production
  if (process.env.NODE_ENV !== 'production' && idToken.startsWith('impersonate:')) {
    const token = idToken.slice('impersonate:'.length);
    const data = _impersonationTokens.get(token);
    if (!data) throw new Error('Invalid or expired impersonation token');
    if (data.expiresAt < Date.now()) {
      _impersonationTokens.delete(token);
      throw new Error('Impersonation token expired');
    }
    return { uid: data.userId };
  }

  // Self-issued JWT (primary auth path)
  try {
    const decoded = jwt.verify(idToken, process.env.JWT_SECRET);
    return { uid: decoded.uid };
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Check if a userId belongs to a test user. Rejects with 403 if so.
 * Use as a guard on routes that shouldn't be called by test users (e.g. Plaid).
 * @returns {boolean} true if test user (response already sent), false if real user
 */
async function rejectTestUser(uid, res) {
  // Deterministic test user UIDs all start with 'test-user-'
  if (uid && uid.startsWith('test-user-')) {
    res.status(403).json({ message: 'Plaid operations are not available for test users' });
    return true;
  }
  return false;
}

module.exports = {
  validateIdToken,
  createImpersonationToken,
  rejectTestUser,
};
