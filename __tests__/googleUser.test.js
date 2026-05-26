import { describe, it, expect, vi } from 'vitest';
import { findOrCreateGoogleUser } from '../utils/googleUser.js';

const profile = { googleSub: 'g-123', email: 'a@b.com', name: 'A', picture: 'p.png' };

describe('findOrCreateGoogleUser', () => {
  it('returns existing user without touching the whitelist', async () => {
    const deps = {
      findUser: vi.fn(async () => [{ id: 'u1', name: 'A', picture: 'p.png' }]),
      updateUser: vi.fn(),
      insertUser: vi.fn(),
      getPool: vi.fn(() => ({ query: vi.fn() })),
    };
    const res = await findOrCreateGoogleUser(profile, deps);
    expect(res).toEqual({ status: 'ok', user: { id: 'u1', name: 'A', picture: 'p.png' } });
    expect(deps.insertUser).not.toHaveBeenCalled();
  });

  it('updates profile when name/picture changed', async () => {
    const deps = {
      findUser: vi.fn(async () => [{ id: 'u1', name: 'Old', picture: 'old.png' }]),
      updateUser: vi.fn(),
      insertUser: vi.fn(),
      getPool: vi.fn(() => ({ query: vi.fn() })),
    };
    await findOrCreateGoogleUser(profile, deps);
    expect(deps.updateUser).toHaveBeenCalledWith('u1', { name: 'A', picture: 'p.png' });
  });

  it('creates a new whitelisted user', async () => {
    const deps = {
      findUser: vi.fn(async () => []),
      updateUser: vi.fn(),
      insertUser: vi.fn(),
      getPool: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [{ email: 'a@b.com' }] })) })),
    };
    const res = await findOrCreateGoogleUser(profile, deps);
    expect(deps.insertUser).toHaveBeenCalledWith({ userId: 'g-123', email: 'a@b.com', name: 'A', picture: 'p.png' });
    expect(res).toEqual({ status: 'ok', user: { id: 'g-123' } });
  });

  it('returns waitlisted for a non-whitelisted new user', async () => {
    const deps = {
      findUser: vi.fn(async () => []),
      updateUser: vi.fn(),
      insertUser: vi.fn(),
      getPool: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [] })) })),
    };
    const res = await findOrCreateGoogleUser(profile, deps);
    expect(res).toEqual({ status: 'waitlisted' });
    expect(deps.insertUser).not.toHaveBeenCalled();
  });
});
