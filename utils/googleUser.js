const { findUser, insertUser, updateUser, getPool } = require('../db/database');

/**
 * Find or create a user from a verified Google profile, honoring the
 * allowed_emails whitelist. Shared by the web OAuth callback and the native
 * sign-in endpoint so both behave identically.
 *
 * @param {{googleSub:string,email:string,name:string,picture:string}} profile
 * @param {object} [deps] - injectable db functions (for tests)
 * @returns {Promise<{status:'ok',user:object}|{status:'waitlisted'}>}
 */
async function findOrCreateGoogleUser({ googleSub, email, name, picture }, deps = {}) {
  const _findUser = deps.findUser || findUser;
  const _insertUser = deps.insertUser || insertUser;
  const _updateUser = deps.updateUser || updateUser;
  const _getPool = deps.getPool || getPool;

  const users = await _findUser(null, email);
  let user = users[0];
  if (user) {
    if (name !== user.name || picture !== user.picture) {
      await _updateUser(user.id, { name, picture });
    }
    return { status: 'ok', user };
  }

  const pool = _getPool();
  const { rows: allowed } = await pool.query(
    'SELECT email FROM allowed_emails WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (allowed.length === 0) return { status: 'waitlisted' };

  await _insertUser({ userId: googleSub, email, name, picture });
  return { status: 'ok', user: { id: googleSub } };
}

module.exports = { findOrCreateGoogleUser };
