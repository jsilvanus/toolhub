import pino from 'pino';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createOidcClient } from './auth/oidc.js';
import { storageFromEnv } from './storage/index.js';
import { loadModules } from './modules.js';
import { refreshManifests } from './manifests.js';

const env = process.env;
const logger = pino({ level: env.LOG_LEVEL || 'info' });

/** Build auth options from env; fails fast on missing production settings. */
/** @returns {import('./auth/index.js').AuthOptions} */
export function authFromEnv(e = env) {
  /** @type {'none'|'oidc'} */
  const mode = e.AUTH_MODE === 'oidc' ? 'oidc' : 'none';
  if (mode === 'none') return { mode, secret: '', groupsClaim: 'groups', secure: false };
  for (const k of ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_REDIRECT_URI', 'SESSION_SECRET']) {
    if (!e[k]) throw new Error(`AUTH_MODE=oidc requires ${k}`);
  }
  if (e.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return {
    mode,
    secret: e.SESSION_SECRET,
    groupsClaim: e.OIDC_GROUPS_CLAIM || 'groups',
    secure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.OIDC_REDIRECT_URI.startsWith('https://'),
    redirectUri: e.OIDC_REDIRECT_URI,
    oidc: createOidcClient({
      issuerUrl: e.OIDC_ISSUER_URL,
      clientId: e.OIDC_CLIENT_ID,
      clientSecret: e.OIDC_CLIENT_SECRET,
      redirectUri: e.OIDC_REDIRECT_URI,
      postLogoutRedirectUri: e.OIDC_POST_LOGOUT_REDIRECT_URI,
      clientAuth: e.OIDC_CLIENT_AUTH === 'basic' ? 'basic' : 'post',
    }),
  };
}

async function main() {
  const config = await loadConfig(env);
  const app = await createApp(config, {
    auth: authFromEnv(),
    storage: storageFromEnv(),
    modules: await loadModules(config),
    logger,
    metricsToken: env.METRICS_BEARER_TOKEN,
  });
  await refreshManifests(config, logger);
  setInterval(() => refreshManifests(config, logger), 10 * 60 * 1000).unref();
  const port = Number(env.PORT || 3000);
  app.listen(port, () => logger.info({ port, basePath: config.basePath }, 'toolhub listening'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.fatal({ err }, 'startup failed');
    process.exit(1);
  });
}
