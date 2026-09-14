/**
 * CD-162 post-manual-QA pass — a cryptographically secure temporary password for Admin → Create
 * User, replacing the previous "Admin types one in" flow. Uses Web Crypto's `getRandomValues`
 * (never `Math.random`, which is not a CSPRNG and must never be used for anything credential-
 * shaped) — available as a global in both this app's Node server-action runtime and every browser,
 * so the same function works for the real Supabase Server Action and the mock provider alike.
 * Excludes visually-ambiguous characters (I/l/1, O/0) so a value the Admin has to read aloud or
 * retype is less error-prone; still draws from a 60-character alphabet across upper/lower/digits/
 * symbols, at 16 characters, for well over 90 bits of entropy.
 */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";

export function generateTemporaryPassword(length = 16): string {
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += PASSWORD_ALPHABET[randomValues[i] % PASSWORD_ALPHABET.length];
  }
  return password;
}
