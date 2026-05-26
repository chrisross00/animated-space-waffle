import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// NOTE: auth-routes.js is CommonJS and pulls apple-signin-auth + utils/appleUser
// via require(). Vitest's vi.mock cannot intercept require() in this project's
// CJS setup, so we inject the two seams the route exposes on router.__nativeDeps
// (same dependency-injection pattern utils/appleUser.js uses). This mocks the
// Apple token verification so the test never hits Apple's JWKS endpoint.

const verifyAppleIdToken = vi.fn();
const findOrCreateAppleUser = vi.fn();

process.env.JWT_SECRET = 'test-secret';

const authRoutes = (await import('../auth-routes.js')).default;

// Override the route's external dependencies with our spies.
authRoutes.__nativeDeps.verifyAppleIdToken = (identityToken) => verifyAppleIdToken(identityToken);
authRoutes.__nativeDeps.findOrCreateAppleUser = (profile) => findOrCreateAppleUser(profile);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
}

describe('POST /auth/native/apple', () => {
  beforeEach(() => { verifyAppleIdToken.mockReset(); findOrCreateAppleUser.mockReset(); });

  it('400 when identityToken missing', async () => {
    const res = await request(makeApp()).post('/auth/native/apple').send({});
    expect(res.status).toBe(400);
  });

  it('401 when Apple verification fails', async () => {
    verifyAppleIdToken.mockRejectedValue(new Error('bad token'));
    const res = await request(makeApp()).post('/auth/native/apple').send({ identityToken: 'x' });
    expect(res.status).toBe(401);
  });

  it('403 waitlisted when user not allowed', async () => {
    verifyAppleIdToken.mockResolvedValue({ sub: 'a1', email: 'a@b.com' });
    findOrCreateAppleUser.mockResolvedValue({ status: 'waitlisted' });
    const res = await request(makeApp()).post('/auth/native/apple')
      .send({ identityToken: 'x', fullName: { givenName: 'A', familyName: 'B' } });
    expect(res.status).toBe(403);
    expect(res.body.waitlisted).toBe(true);
  });

  it('200 with a JWT on first sign-in (new user, email + name present)', async () => {
    verifyAppleIdToken.mockResolvedValue({ sub: 'a1', email: 'a@b.com' });
    findOrCreateAppleUser.mockResolvedValue({ status: 'ok', user: { id: 'a1', email: 'a@b.com' } });
    const res = await request(makeApp()).post('/auth/native/apple')
      .send({ identityToken: 'x', fullName: { givenName: 'A', familyName: 'B' } });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    // First sign-in: route should forward the composed full name to user resolution.
    expect(findOrCreateAppleUser).toHaveBeenCalledWith(
      expect.objectContaining({ appleSub: 'a1', email: 'a@b.com', name: 'A B' })
    );
  });

  it('200 with a JWT on return sign-in (no email — resolved by stored apple sub)', async () => {
    // Apple omits the email on return sign-ins.
    verifyAppleIdToken.mockResolvedValue({ sub: 'a1' });
    findOrCreateAppleUser.mockResolvedValue({ status: 'ok', user: { id: 'a1', email: 'a@b.com' } });
    const res = await request(makeApp()).post('/auth/native/apple').send({ identityToken: 'x' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(findOrCreateAppleUser).toHaveBeenCalledWith(
      expect.objectContaining({ appleSub: 'a1', email: undefined, name: null })
    );
  });

  it('401 when a returning Apple user cannot be resolved', async () => {
    verifyAppleIdToken.mockResolvedValue({ sub: 'a-unknown' });
    findOrCreateAppleUser.mockResolvedValue({ status: 'unknown_user' });
    const res = await request(makeApp()).post('/auth/native/apple').send({ identityToken: 'x' });
    expect(res.status).toBe(401);
  });
});
