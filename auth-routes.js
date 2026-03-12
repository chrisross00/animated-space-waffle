const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { findUser, insertUser, updateUser } = require('./db/database');

const router = express.Router();

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
  return `http://localhost:${process.env.PORT || 3000}/auth/google/callback`;
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

    // Look up existing user by email first (preserves Firebase UIDs for migrated users)
    const users = await findUser(null, email);
    let user = users[0];
    if (user) {
      // Update profile info from Google (name/picture may have changed)
      if (name !== user.name || picture !== user.picture) {
        await updateUser(user.id, { name, picture });
      }
    } else {
      // New user — use Google sub as user ID
      await insertUser({ userId: googleSub, email, name, picture });
      user = { id: googleSub };
    }

    // Issue JWT
    const token = jwt.sign(
      { uid: user.id, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    const redirect = stateData.redirect || '/';
    const separator = redirect.includes('?') ? '&' : '?';
    res.redirect(`${redirect}${separator}token=${token}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed. <a href="/">Try again</a>');
  }
});

module.exports = router;
