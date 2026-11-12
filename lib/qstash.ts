import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Checks the "Upstash-Signature" header QStash puts on every request it sends: a JWT signed (HS256) with the signing
// keys that connecting QStash to the Vercel project adds as QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
// Both keys are tried, so rotating them in the Upstash console doesn't break the schedule.

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const signingKeys = () => [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY].filter((k): k is string => Boolean(k));

export function verifyQStash(signature: string | null, body: string, keys = signingKeys(), now = Date.now()): boolean {
  if (!signature || !keys.length) return false;
  const parts = signature.split('.');
  if (parts.length !== 3) return false;
  const [header, payload, sig] = parts;

  // Compared as text, so only the exact encoding QStash produces is accepted.
  const given = Buffer.from(sig.replace(/=+$/, ''));
  const signedBy = keys.some((key) => {
    const expected = Buffer.from(b64url(createHmac('sha256', key).update(`${header}.${payload}`).digest()));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!signedBy) return false;

  let claims: { iss?: string; exp?: number; nbf?: number; body?: string };
  try {
    claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return false;
  }
  const t = Math.floor(now / 1000);
  if (claims.iss !== 'Upstash') return false;
  if (typeof claims.exp === 'number' && claims.exp < t) return false;
  if (typeof claims.nbf === 'number' && claims.nbf > t + 30) return false;
  // The token carries a hash of the body, so a captured signature can't be reused with a different body.
  if ((claims.body ?? '').replace(/=+$/, '') !== b64url(createHash('sha256').update(body).digest())) return false;
  return true;
}
