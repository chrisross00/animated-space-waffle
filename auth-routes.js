const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const { findOrCreateGoogleUser } = require('./utils/googleUser');
const { findOrCreateAppleUser } = require('./utils/appleUser');

const router = express.Router();

// Native sign-in posts a JSON body. The web OAuth routes are GET-only and
// unaffected. Body parsing is per-router here (matching api.js / plaid-api.js /
// admin-api.js) because index.js has no global express.json().
router.use(bodyParser.json({ limit: '1mb' }));

// Verifier for Google ID tokens minted by the native Google Sign-In SDK.
const _googleClient = new OAuth2Client();
const GOOGLE_AUDIENCES = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(Boolean);

// Apple identity tokens carry the app's bundle id as `aud`. apple-signin-auth's
// verifyIdToken fetches Apple's JWKS, verifies the RS256 signature, and checks
// iss === 'https://appleid.apple.com', aud, and exp.
const APPLE_AUDIENCE = process.env.APPLE_BUNDLE_ID || 'com.basilbudgeting.app';

// Seam for the native sign-in routes' external dependencies. Production uses the
// real Google/Apple verifiers + user lookups; tests override these because
// Vitest's vi.mock cannot intercept CommonJS require() in this project (same
// reason utils/googleUser.js takes injectable deps). Web OAuth routes never
// touch this.
const _deps = {
  verifyGoogleIdToken: (idToken) =>
    _googleClient.verifyIdToken({ idToken, audience: GOOGLE_AUDIENCES }),
  findOrCreateGoogleUser,
  verifyAppleIdToken: (identityToken) =>
    appleSignin.verifyIdToken(identityToken, { audience: APPLE_AUDIENCE }),
  findOrCreateAppleUser,
};

// In-memory CSRF state tokens (short-lived, cleared on use)
const _pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of _pendingStates) {
    if (data.expiresAt < now) _pendingStates.delete(state);
  }
}, 60 * 1000);

function getRedirectUri() {
  // In production, use the configured domain. In dev, use localhost.
  if (process.env.NODE_ENV === 'production') {
    return `https://${process.env.DOMAIN || 'basilbudgeting.com'}/auth/google/callback`;
  }
  // In dev, Google calls back to the Express server (PORT), but the final
  // redirect sends the user to the Vite dev server (VITE_PORT) so they get
  // the live dev build, not a stale frontend/dist.
  return `http://localhost:${process.env.PORT || 3000}/auth/google/callback`;
}

// Allowed redirect origins for post-login (prevent open redirect)
const ALLOWED_REDIRECT_ORIGINS = [
  'https://admin.basilbudgeting.com',
];

function getPostLoginRedirect(redirectParam, token) {
  // If redirect is an allowed full URL, append token and redirect there
  if (redirectParam && ALLOWED_REDIRECT_ORIGINS.some(o => redirectParam.startsWith(o))) {
    const sep = redirectParam.includes('?') ? '&' : '?';
    return `${redirectParam}${sep}token=${token}`;
  }

  // Otherwise treat as a same-origin path
  const path = redirectParam || '/';
  const vitePort = process.env.VITE_PORT;
  if (process.env.NODE_ENV !== 'production' && vitePort) {
    return `http://localhost:${vitePort}${path}?token=${token}`;
  }
  return `${path}?token=${token}`;
}

/**
 * GET /auth/google — Redirect to Google OAuth consent screen.
 * Optional query param: ?redirect=/admin (where to send user after auth)
 */
router.get('/google', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const redirect = req.query.redirect || '/';
  _pendingStates.set(state, { redirect, expiresAt: Date.now() + STATE_TTL_MS });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/**
 * GET /auth/google/callback — Exchange auth code for user info, issue JWT.
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;

  // Validate CSRF state
  const stateData = _pendingStates.get(state);
  if (!stateData) {
    return res.status(400).send('Invalid or expired OAuth state. <a href="/">Try again</a>');
  }
  _pendingStates.delete(state);

  if (!code) {
    return res.status(400).send('Missing authorization code. <a href="/">Try again</a>');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Google token exchange failed:', err);
      return res.status(500).send('Authentication failed. <a href="/">Try again</a>');
    }

    const tokens = await tokenRes.json();

    // Decode the Google ID token to get user info (no verification needed —
    // we just received it directly from Google over HTTPS)
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()
    );

    const { sub: googleSub, email, name, picture } = payload;

    const result = await findOrCreateGoogleUser({ googleSub, email, name, picture });
    if (result.status === 'waitlisted') {
      console.log('User not on whitelist, redirecting to waitlist:', email);
      const redirect = stateData.redirect || '/';
      const sep = redirect.includes('?') ? '&' : '?';
      return res.redirect(`${redirect}${sep}waitlisted=true`);
    }
    const user = result.user;

    // Issue JWT
    const token = jwt.sign(
      { uid: user.id, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token — always land on / and let the
    // Vue router guard decide the final destination based on user state.
    res.redirect(getPostLoginRedirect(stateData.redirect, token));
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed. <a href="/">Try again</a>');
  }
});

/**
 * POST /auth/native/google — native app sign-in.
 * Body: { idToken } — a Google ID token from the native Google Sign-In SDK.
 * Returns: 200 { token } (self-issued JWT) | 400 | 401 | 403 { waitlisted:true }
 */
router.post('/native/google', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ message: 'Missing idToken' });

  let payload;
  try {
    const ticket = await _deps.verifyGoogleIdToken(idToken);
    payload = ticket.getPayload();
  } catch (err) {
    console.error('Native Google token verify failed:', err.message);
    return res.status(401).json({ message: 'Invalid Google token' });
  }

  const { sub: googleSub, email, name, picture } = payload;
  const result = await _deps.findOrCreateGoogleUser({ googleSub, email, name, picture });
  if (result.status === 'waitlisted') return res.status(403).json({ waitlisted: true });

  const token = jwt.sign({ uid: result.user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

/**
 * POST /auth/native/apple — native app sign-in (Sign in with Apple).
 * Required for App Store approval (Guideline 4.8) because we offer Google login.
 *
 * Body: { identityToken, fullName? } — identityToken is the JWT minted by
 *   expo-apple-authentication; fullName is { givenName, familyName } and is only
 *   provided by Apple on the FIRST sign-in.
 * Returns: 200 { token } (self-issued JWT) | 400 | 401 | 403 { waitlisted:true }
 */
router.post('/native/apple', async (req, res) => {
  const { identityToken, fullName } = req.body || {};
  if (!identityToken) return res.status(400).json({ message: 'Missing identityToken' });

  let payload;
  try {
    // Verifies signature against Apple's JWKS + checks iss/aud/exp.
    payload = await _deps.verifyAppleIdToken(identityToken);
  } catch (err) {
    console.error('Native Apple token verify failed:', err.message);
    return res.status(401).json({ message: 'Invalid Apple token' });
  }

  const { sub: appleSub, email } = payload;
  if (!appleSub) return res.status(401).json({ message: 'Invalid Apple token' });

  // Apple sends the name separately (not in the token) and only on first sign-in.
  const name = fullName && (fullName.givenName || fullName.familyName)
    ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
    : null;

  const result = await _deps.findOrCreateAppleUser({ appleSub, email, name });
  if (result.status === 'waitlisted') return res.status(403).json({ waitlisted: true });
  if (result.status !== 'ok') return res.status(401).json({ message: 'Unknown Apple user' });

  const token = jwt.sign(
    { uid: result.user.id, email: result.user.email || email || null },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token });
});

// Test-only seam: lets specs substitute the Google/Apple verifiers + user lookups
// for the native sign-in routes. Untouched in production.
router.__nativeDeps = _deps;

module.exports = router;
