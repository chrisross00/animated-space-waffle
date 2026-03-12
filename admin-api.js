/**
 * Admin API routes — /admin/*
 * All routes require admin privileges (isAdmin on Basil-Users doc).
 * Test user seeding/nuking is dev/staging only (NODE_ENV !== 'production').
 */

const express = require('express');
const bodyParser = require('body-parser');
const { validateIdToken, createImpersonationToken } = require('./utils/authentication');
const { findUserData } = require('./db/database');
const { seedPersona, listTestUsers, nukeTestUsers, getPersonaList } = require('./scripts/test-data/seed');

const router = express.Router();
router.use(bodyParser.json({ limit: '1mb' }));

// --- Middleware: require admin for all /admin routes ---
async function requireAdmin(req, res, next) {
  try {
    const decodedToken = await validateIdToken(req);
    const users = await findUserData('Basil-Users', decodedToken.uid);
    if (!users.length || !users[0].isAdmin) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.adminUid = decodedToken.uid;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

router.use(requireAdmin);

// --- Dev/staging only guard ---
function devOnly(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Not available in production' });
  }
  next();
}

// --- Routes ---

/** List available personas */
router.get('/personas', devOnly, (req, res) => {
  res.json(getPersonaList());
});

/** List seeded test users in the database */
router.get('/test-users', devOnly, async (req, res) => {
  try {
    const { getDb } = require('./db/database');
    const db = getDb();
    const users = await listTestUsers(db);
    res.json(users);
  } catch (err) {
    console.error('/admin/test-users error:', err.message);
    res.status(500).json({ message: 'Failed to list test users' });
  }
});

/** Seed a test user persona (idempotent — wipes and recreates) */
router.post('/seed-test-user', devOnly, async (req, res) => {
  try {
    const { persona } = req.body;
    if (!persona) {
      return res.status(400).json({ message: 'Missing "persona" in request body' });
    }

    const { getDb } = require('./db/database');
    const db = getDb();

    if (persona === 'all') {
      const results = [];
      for (const p of getPersonaList()) {
        results.push(await seedPersona(db, p.name));
      }
      return res.json({ results });
    }

    const result = await seedPersona(db, persona);
    res.json(result);
  } catch (err) {
    console.error('/admin/seed-test-user error:', err.message);
    res.status(err.message.startsWith('Unknown persona') ? 400 : 500)
      .json({ message: err.message });
  }
});

/** Nuke all test user data */
router.post('/nuke-test-users', devOnly, async (req, res) => {
  try {
    const { getDb } = require('./db/database');
    const db = getDb();
    const dryRun = req.body.dryRun === true;
    const result = await nukeTestUsers(db, { dryRun });
    res.json(result);
  } catch (err) {
    console.error('/admin/nuke-test-users error:', err.message);
    res.status(500).json({ message: 'Failed to nuke test users' });
  }
});

/** Create an impersonation token for "Login As" flow */
router.post('/login-as', devOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'Missing "userId" in request body' });
    }
    const result = createImpersonationToken(userId);
    res.json(result);
  } catch (err) {
    console.error('/admin/login-as error:', err.message);
    res.status(500).json({ message: 'Failed to create impersonation token' });
  }
});

module.exports = router;
