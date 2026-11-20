const hashPassword = async (password) => {
  const bytes = new TextEncoder().encode(password);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const makePasswordHash = hashPassword;

export const verifyDemoPassword = async (user, password) => {
  if (user.passwordHash) return (await hashPassword(password)) === user.passwordHash;
  return password === `${user.email.split('@')[0]}123`;
};
