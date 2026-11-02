import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, parseCookies } from '../src/auth/session.js';
import { safeReturnTo } from '../src/auth/index.js';
import { baseRaw, start } from './helpers.js';

const SECRET = 'x'.repeat(40);

test('session tokens: valid, tampered, expired', () => {
  const t = sign({ sub: '1' }, SECRET, 60);
  assert.equal(verify(t, SECRET).sub, '1');
  assert.equal(verify(t, 'y'.repeat(40)), null);
  assert.equal(verify(t.slice(0, -2) + 'AA', SECRET), null);
  assert.equal(verify(sign({ sub: '1' }, SECRET, -10), SECRET), null);
  assert.equal(verify('garbage', SECRET), null);
});

test('safeReturnTo only allows paths under the base path', () => {
  assert.equal(safeReturnTo('/hub/guides/a', '/hub'), '/hub/guides/a');
  assert.equal(safeReturnTo('//evil.example.org', '/hub'), '/hub/');
  assert.equal(safeReturnTo('https://evil.example.org', '/hub'), '/hub/');
  assert.equal(safeReturnTo('/other', '/hub'), '/hub/');
  assert.equal(safeReturnTo('/x', ''), '/x');
});

function fakeOidc(claims) {
  return {
    calls: [],
    async authorizationUrl(flow) {
      this.calls.push(flow);
      return `https://idp.example.org/auth?state=${flow.state}`;
    },
    async callback(url, checks) {
      if (url.searchParams.get('state') !== checks.state) throw new Error('state mismatch');
      return claims;
    },
    async endSessionUrl() {
      return 'https://idp.example.org/logout';
    },
  };
}

async function oidcHub(claims, basePath = '/hub') {
  const oidc = fakeOidc(claims);
  const auth = { mode: 'oidc', secret: SECRET, groupsClaim: 'groups', secure: false, redirectUri: 'https://hub.example.org/hub/auth/callback', oidc };
  return { oidc, ...(await start(baseRaw, { auth }, { basePath })) };
}

/** Run login + callback, returning the session cookie header value. */
async function login(h) {
  const r1 = await fetch(`${h.url}/hub/auth/login`, { redirect: 'manual' });
  assert.equal(r1.status, 302);
  const flowCookie = r1.headers.getSetCookie()[0].split(';')[0];
  assert.match(r1.headers.getSetCookie()[0], /Path=\/hub/);
  assert.match(r1.headers.getSetCookie()[0], /HttpOnly/);
  const state = h.oidc.calls[0].state;
  const r2 = await fetch(`${h.url}/hub/auth/callback?code=c&state=${state}`, { redirect: 'manual', headers: { cookie: flowCookie } });
  assert.equal(r2.status, 302);
  return { r2, cookie: r2.headers.getSetCookie()[0].split(';')[0] };
}

test('unauthenticated landing redirects to login; /auth/check is 401', async () => {
  const h = await oidcHub({});
  try {
    const r = await fetch(`${h.url}/hub/`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /^\/hub\/auth\/login\?returnTo=/);
    assert.equal((await fetch(`${h.url}/hub/auth/check`)).status, 401);
  } finally {
    await h.close();
  }
});

test('login flow sets session, filters tools by group, /auth/check returns headers', async () => {
  const h = await oidcHub({ sub: 'u1', email: 'a@example.org', name: 'Ann', groups: ['staff'] });
  try {
    const { r2, cookie } = await login(h);
    assert.equal(r2.headers.get('location'), '/hub/');
    const html = await (await fetch(`${h.url}/hub/`, { headers: { cookie } })).text();
    assert.match(html, /One/);
    assert.match(html, /Two/);
    assert.doesNotMatch(html, /Three/);
    assert.match(html, /Ann/);
    const chk = await fetch(`${h.url}/hub/auth/check`, { headers: { cookie } });
    assert.equal(chk.status, 200);
    assert.equal(chk.headers.get('x-toolhub-user-email'), 'a@example.org');
    assert.equal(chk.headers.get('x-toolhub-user-groups'), 'staff');
    const out = await fetch(`${h.url}/hub/auth/logout`, { redirect: 'manual', headers: { cookie } });
    assert.equal(out.headers.get('location'), 'https://idp.example.org/logout');
    assert.match(out.headers.getSetCookie()[0], /Max-Age=0/);
  } finally {
    await h.close();
  }
});

test('callback rejects missing flow cookie and state mismatch', async () => {
  const h = await oidcHub({ sub: 'u1', groups: [] });
  try {
    assert.equal((await fetch(`${h.url}/hub/auth/callback?code=c&state=s`)).status, 400);
    const r1 = await fetch(`${h.url}/hub/auth/login`, { redirect: 'manual' });
    const flowCookie = r1.headers.getSetCookie()[0].split(';')[0];
    assert.equal((await fetch(`${h.url}/hub/auth/callback?code=c&state=wrong`, { headers: { cookie: flowCookie } })).status, 400);
  } finally {
    await h.close();
  }
});

test('string groups claim is accepted; cookies parse', async () => {
  const h = await oidcHub({ sub: 'u1', groups: 'admins' });
  try {
    const { cookie } = await login(h);
    assert.equal((await fetch(`${h.url}/hub/auth/check`, { headers: { cookie } })).headers.get('x-toolhub-user-groups'), 'admins');
    assert.equal(parseCookies('a=1; b=hello%20x').b, 'hello x');
  } finally {
    await h.close();
  }
});
