const {
  findUser,
  findUserByAppleSub,
  insertUser,
  setAppleSub,
  updateUser,
  getPool,
} = require('../db/database');

/**
 * Find or create a user from a verified Apple identity token.
 *
 * Apple only returns the user's email on the FIRST sign-in. So:
 *  - email present  → first sign-in: find/create the user by email, then stamp
 *    the stable Apple `sub` so future (emailless) sign-ins can find them.
 *  - email absent   → returning user: look the user up by the stored Apple `sub`.
 *
 * New accounts honor the allowed_emails whitelist, matching findOrCreateGoogleUser.
 *
 * @param {{appleSub:string,email?:string|null,name?:string|null}} profile
 * @param {object} [deps] - injectable db functions (for tests)
 * @returns {Promise<{status:'ok',user:object}|{status:'waitlisted'}|{status:'unknown_user'}>}
 */
async function findOrCreateAppleUser({ appleSub, email, name }, deps = {}) {
  const _findUser = deps.findUser || findUser;
  const _findUserByAppleSub = deps.findUserByAppleSub || findUserByAppleSub;
  const _insertUser = deps.insertUser || insertUser;
  const _setAppleSub = deps.setAppleSub || setAppleSub;
  const _updateUser = deps.updateUser || updateUser;
  const _getPool = deps.getPool || getPool;

  // Returning Apple user: no email this time, resolve by the stored stable sub.
  if (!email) {
    const bySub = await _findUserByAppleSub(appleSub);
    if (bySub[0]) return { status: 'ok', user: bySub[0] };
    // No email AND no known sub — nothing we can key on. (Should be rare: only
    // happens if a returning user's sub was never persisted.)
    return { status: 'unknown_user' };
  }

  // First sign-in (email present). Prefer an existing account already linked to
  // this Apple sub, then fall back to matching by email (e.g. a Google user
  // adding Apple sign-in with the same address).
  const bySub = await _findUserByAppleSub(appleSub);
  let user = bySub[0];
  if (!user) {
    const byEmail = await _findUser(null, email);
    user = byEmail[0];
  }

  if (user) {
    if (name && name !== user.name) await _updateUser(user.id, { name });
    if (!user.appleSub) await _setAppleSub(user.id, appleSub);
    return { status: 'ok', user };
  }

  // Brand-new account — honor the whitelist before creating.
  const pool = _getPool();
  const { rows: allowed } = await pool.query(
    'SELECT email FROM allowed_emails WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (allowed.length === 0) return { status: 'waitlisted' };

  // Key the new user by their Apple sub (stable, opaque), mirroring how Google
  // users are keyed by their Google sub.
  await _insertUser({ userId: appleSub, email, name });
  await _setAppleSub(appleSub, appleSub);
  return { status: 'ok', user: { id: appleSub } };
}

module.exports = { findOrCreateAppleUser };
