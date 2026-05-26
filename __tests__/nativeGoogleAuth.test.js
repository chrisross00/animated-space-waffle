import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// NOTE: auth-routes.js is CommonJS and pulls google-auth-library +
// utils/googleUser via require(). Vitest's vi.mock cannot intercept require()
// in this project's CJS setup, so we inject the two seams the route exposes on
// router.__nativeDeps (same dependency-injection pattern utils/googleUser.js
// uses). Assertions (status codes + body shape) match the original spec exactly.

const verifyIdToken = vi.fn();
const findOrCreateGoogleUser = vi.fn();

process.env.JWT_SECRET = 'test-secret';
process.env.GOOGLE_CLIENT_ID = 'web-client';

const authRoutes = (await import('../auth-routes.js')).default;

// Override the route's external dependencies with our spies.
authRoutes.__nativeDeps.verifyGoogleIdToken = (idToken) => verifyIdToken(idToken);
authRoutes.__nativeDeps.findOrCreateGoogleUser = (profile) => findOrCreateGoogleUser(profile);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
}

describe('POST /auth/native/google', () => {
  beforeEach(() => { verifyIdToken.mockReset(); findOrCreateGoogleUser.mockReset(); });

  it('400 when idToken missing', async () => {
    const res = await request(makeApp()).post('/auth/native/google').send({});
    expect(res.status).toBe(400);
  });

  it('401 when Google verification fails', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad token'));
    const res = await request(makeApp()).post('/auth/native/google').send({ idToken: 'x' });
    expect(res.status).toBe(401);
  });

  it('403 waitlisted when user not allowed', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'g1', email: 'a@b.com', name: 'A', picture: 'p' }) });
    findOrCreateGoogleUser.mockResolvedValue({ status: 'waitlisted' });
    const res = await request(makeApp()).post('/auth/native/google').send({ idToken: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.waitlisted).toBe(true);
  });

  it('200 with a JWT on success', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'g1', email: 'a@b.com', name: 'A', picture: 'p' }) });
    findOrCreateGoogleUser.mockResolvedValue({ status: 'ok', user: { id: 'g1' } });
    const res = await request(makeApp()).post('/auth/native/google').send({ idToken: 'x' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });
});
