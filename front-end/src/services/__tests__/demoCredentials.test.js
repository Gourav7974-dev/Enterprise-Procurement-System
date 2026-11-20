import { describe, expect, it } from 'vitest';
import { users } from '../../data/mockData';
import { makePasswordHash, verifyDemoPassword } from '../demoCredentials';

describe('demo account passwords', () => {
  it('accepts username123 for every seeded account', async () => {
    for (const user of users) {
      await expect(verifyDemoPassword(user, `${user.email.split('@')[0]}123`)).resolves.toBe(true);
    }
  });

  it('rejects an incorrect password for a known account', async () => {
    await expect(verifyDemoPassword(users[0], 'wrong-password')).resolves.toBe(false);
  });

  it('validates registered accounts using their password hash', async () => {
    const user = { email: 'new.user@example.com', passwordHash: await makePasswordHash('my-secret') };
    await expect(verifyDemoPassword(user, 'my-secret')).resolves.toBe(true);
    await expect(verifyDemoPassword(user, 'wrong-password')).resolves.toBe(false);
  });
});
