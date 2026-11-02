import express from 'express';
import { sign, verify, parseCookies, cookie } from './session.js';
import { randomState, randomNonce, randomCodeVerifier } from './oidc.js';

export const SESSION_COOKIE = 'toolhub_session';
const FLOW_COOKIE = 'toolhub_oidc';
const SESSION_TTL = 8 * 3600;

/**
 * @typedef {{ mode: 'none'|'oidc', secret: string, groupsClaim: string, secure: boolean,
 *   redirectUri?: string, oidc?: import('./oidc.js').OidcClient }} AuthOptions
 */

/** Read the signed-in user from the request cookie (null if none/invalid). */
export function getUser(req, auth) {
  if (auth.mode !== 'oidc') return null;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const s = verify(token, auth.secret);
  if (!s) return null;
  return { sub: s.sub, email: s.email, name: s.name, groups: Array.isArray(s.groups) ? s.groups : [] };
}

/** Only allow same-site relative return paths under the base path. */
export function safeReturnTo(value, basePath) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return `${basePath}/`;
  if (basePath && value !== basePath && !value.startsWith(`${basePath}/`)) return `${basePath}/`;
  return value;
}

/**
 * Routes: /auth/login, /auth/callback, /auth/logout, /auth/check.
 * @param {import('../config.js').HubConfig} config
 * @param {AuthOptions} auth
 */
export function authRouter(config, auth) {
  const r = express.Router();
  const path = config.basePath || '/';
  const cookieOpts = { path, secure: auth.secure };

  r.get('/auth/check', (req, res) => {
    const user = getUser(req, auth);
    if (auth.mode === 'none') return res.status(200).end();
    if (!user) return res.status(401).end();
    res.set('X-Toolhub-User-Email', user.email || '');
    res.set('X-Toolhub-User-Groups', user.groups.join(','));
    res.status(200).end();
  });

  if (auth.mode !== 'oidc' || !auth.oidc) return r;
  const oidc = auth.oidc;

  r.get('/auth/login', async (req, res, next) => {
    try {
      const flow = { state: randomState(), nonce: randomNonce(), codeVerifier: randomCodeVerifier(), returnTo: safeReturnTo(req.query.returnTo, config.basePath) };
      const url = await oidc.authorizationUrl(flow);
      res.append('Set-Cookie', cookie(FLOW_COOKIE, sign(flow, auth.secret, 600), { ...cookieOpts, maxAge: 600 }));
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  });

  r.get('/auth/callback', async (req, res) => {
    try {
      const flow = verify(parseCookies(req.headers.cookie)[FLOW_COOKIE], auth.secret);
      if (!flow) return res.status(400).type('text').send('Login session expired. Please try again.');
      const current = new URL(auth.redirectUri || '', 'http://localhost');
      current.search = new URLSearchParams(/** @type {any} */ (req.query)).toString();
      const claims = await oidc.callback(current, flow);
      const raw = claims[auth.groupsClaim];
      const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
      const session = sign({ sub: claims.sub, email: claims.email, name: claims.name, groups }, auth.secret, SESSION_TTL);
      res.append('Set-Cookie', cookie(SESSION_COOKIE, session, { ...cookieOpts, maxAge: SESSION_TTL }));
      res.append('Set-Cookie', cookie(FLOW_COOKIE, '', { ...cookieOpts, maxAge: 0 }));
      res.redirect(safeReturnTo(flow.returnTo, config.basePath));
    } catch (err) {
      req.log?.warn({ err }, 'oidc callback failed');
      res.status(400).type('text').send('Login failed.');
    }
  });

  r.get('/auth/logout', async (req, res) => {
    res.append('Set-Cookie', cookie(SESSION_COOKIE, '', { ...cookieOpts, maxAge: 0 }));
    res.redirect((await oidc.endSessionUrl()) || `${config.basePath}/`);
  });

  return r;
}
