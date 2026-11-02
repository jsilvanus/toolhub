import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import client from 'prom-client';
import { authRouter, getUser } from './auth/index.js';
import { visibleSections } from './registry.js';
import { landing } from './views.js';
import { loadGuides, guidesRouter } from './guides.js';
import { modulesRouter } from './modules.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Build the Express app. Everything is mounted under config.basePath (no proxy prefix stripping needed).
 * @param {import('./config.js').HubConfig} config
 * @param {{ auth: import('./auth/index.js').AuthOptions, storage?: any, modules?: any[], logger?: any,
 *   metricsToken?: string, guides?: import('./guides.js').Guide[] }} deps
 */
export async function createApp(config, deps) {
  const logger = deps.logger ?? pino({ level: 'silent' });
  const auth = deps.auth;
  const guides = deps.guides ?? loadGuides(config.guidesDir);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(pinoHttp({ logger: logger.child({}, { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] }) }));

  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  const requests = new client.Counter({ name: 'toolhub_http_requests_total', help: 'HTTP requests', labelNames: ['status'], registers: [registry] });
  app.use((req, res, next) => {
    res.on('finish', () => requests.inc({ status: String(res.statusCode) }));
    next();
  });

  const r = express.Router();
  r.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  r.get('/health', (_req, res) => res.json({ status: 'ok' }));
  r.get('/metrics', async (req, res) => {
    const token = deps.metricsToken;
    const given = (req.headers.authorization || '').replace(/^Bearer /, '');
    const ok = token && given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) return res.status(token ? 401 : 404).end();
    res.type(registry.contentType).send(await registry.metrics());
  });
  r.use('/assets', express.static(PUBLIC_DIR, { maxAge: '1h' }));
  r.use(authRouter(config, auth));
  r.use(await modulesRouter(config, auth, deps.modules ?? [], logger));
  r.use(guidesRouter(config, auth, deps.storage ?? null, guides));
  r.get('/', (req, res) => {
    const user = getUser(req, auth);
    if (auth.mode === 'oidc' && !user) return res.redirect(`${config.basePath}/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    const sections = visibleSections(config, user, auth.mode, guides);
    res.type('html').send(landing(config, sections, { user, authMode: auth.mode }));
  });

  app.use(config.basePath || '/', r);
  app.use((err, req, res, _next) => {
    req.log?.error({ err }, 'request failed');
    res.status(500).type('text').send('Internal error');
  });
  return app;
}
