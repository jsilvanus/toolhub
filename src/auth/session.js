import crypto from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

/** Sign a JSON-serialisable payload with an expiry (seconds from now). */
export function sign(payload, secret, ttlSeconds) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/** Verify a signed token. Returns the payload or null (bad signature, malformed, expired). */
export function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let given;
  try {
    given = Buffer.from(mac, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Serialise a Set-Cookie value. maxAge null = session cookie; 0 deletes. */
export function cookie(name, value, { path, secure, maxAge }) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path || '/'}; HttpOnly; SameSite=Lax`;
  if (secure) s += '; Secure';
  if (maxAge !== undefined && maxAge !== null) s += `; Max-Age=${maxAge}`;
  return s;
}
