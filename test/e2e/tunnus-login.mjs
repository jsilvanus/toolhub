// End-to-end sign-in of a running toolhub (OIDC mode) against a running Tunnus container.
// Env: HUB_URL (default http://127.0.0.1:3000/hub), TUNNUS_ORIGIN (default http://127.0.0.1:4000),
//      TUNNUS_LOGS_CMD (default "docker logs tunnus 2>&1"; prints the sign-in code log lines).
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const hub = process.env.HUB_URL || 'http://127.0.0.1:3000/hub';
const idp = process.env.TUNNUS_ORIGIN || 'http://127.0.0.1:4000';
const logsCmd = process.env.TUNNUS_LOGS_CMD || 'docker logs tunnus 2>&1';
const email = 'e2e.user@example.org';

const jar = new Map();
const store = (res) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (!value || /Max-Age=0|1970/i.test(c)) jar.delete(name);
    else jar.set(name, value);
  }
};
async function go(url, init = {}) {
  for (let i = 0; i < 20; i++) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...init.headers, cookie } });
    store(res);
    const loc = res.headers.get('location');
    if (loc) {
      url = new URL(loc, url).href;
      init = {};
      continue;
    }
    return { res, url, body: await res.text() };
  }
  throw new Error('too many redirects');
}
const form = (data) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });

function latestCode() {
  const lines = execSync(logsCmd, { encoding: 'utf8' }).split('\n').filter((l) => l.includes('sign-in code'));
  assert.ok(lines.length, 'no sign-in code in Tunnus logs');
  return JSON.parse(lines.at(-1)).code;
}

// 1. Unauthenticated visit is sent to the provider.
let p = await go(`${hub}/`);
assert.ok(p.url.startsWith(`${idp}/`), `expected redirect to provider, got ${p.url}`);
const uid = /action="([^"]+)\/email"/.exec(p.body)?.[1];
assert.ok(uid, 'provider email form not found');

// 2. Email, then the emailed code.
await go(`${idp}${uid}/email`, form({ email }));
await new Promise((r) => setTimeout(r, 500));
p = await go(`${idp}${uid}/code`, form({ code: latestCode() }));
assert.ok(p.url.startsWith(`${hub}/`), `expected return to hub, got ${p.url}`);
assert.equal(p.res.status, 200);

// 3. Cards are filtered by the groups claim.
const titles = [...p.body.matchAll(/card-title">([^<]+)/g)].map((m) => m[1]);
assert.deepEqual(titles, ['Open tool', 'All group tool']);

// 4. Forward-auth endpoint.
const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const chk = await fetch(`${hub}/auth/check`, { headers: { cookie } });
assert.equal(chk.status, 200);
assert.equal(chk.headers.get('x-toolhub-user-email'), email);
assert.match(chk.headers.get('x-toolhub-user-groups') || '', /\ball\b/);

// 5. Logout ends both sessions and returns to the signed-out page.
p = await go(`${hub}/auth/logout`);
const action = /action="([^"]+)"/.exec(p.body)?.[1];
const xsrf = /name="xsrf" value="([^"]+)"/.exec(p.body)?.[1];
assert.ok(action && xsrf, 'provider logout confirmation not shown');
p = await go(new URL(action.replace(/&amp;/g, '&'), p.url).href, form({ xsrf, logout: 'yes' }));
assert.equal(p.url, `${hub}/auth/signed-out`);
p = await go(`${hub}/`);
assert.ok(p.url.startsWith(`${idp}/`), 'hub should require sign-in again after logout');

console.log('tunnus e2e: ok');
