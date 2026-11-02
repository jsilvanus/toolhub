import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * @typedef {{ id: string, title: string, description?: string, order?: number }} Section
 * @typedef {{ slug: string, title: string, description?: string, icon?: string, url: string,
 *   section: string, groups?: string[], newTab?: boolean, guide?: string, manifestUrl?: string, module?: string }} Tool
 * @typedef {{ name: string, logo?: string, lang: string, labels: Record<string,string>, basePath: string,
 *   sections: Section[], tools: Tool[], guidesDir?: string, configDir?: string }} HubConfig
 */

export const DEFAULT_LABELS = {
  signIn: 'Sign in',
  signOut: 'Sign out',
  guide: 'Guide',
  guides: 'Guides',
  noTools: 'No tools are available to you yet.',
  signedInAs: 'Signed in as',
  back: 'Back',
  forbidden: 'You do not have access to this page.',
  notFound: 'Not found',
};

/** Normalise a base path: '' for root, otherwise '/x/y' (leading slash, no trailing slash). */
export function normalizeBasePath(value) {
  const trimmed = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

function fail(msg) {
  throw new Error(`Invalid toolhub config: ${msg}`);
}

/**
 * Validate a raw config object and fill defaults.
 * @param {any} raw
 * @param {{ basePath?: string }} [overrides]
 * @returns {HubConfig}
 */
export function validateConfig(raw, overrides = {}) {
  if (!raw || typeof raw !== 'object') fail('config must be an object');
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const tools = Array.isArray(raw.tools) ? raw.tools : [];
  const sectionIds = new Set();
  sections.forEach((s, i) => {
    if (!s?.id || !s?.title) fail(`sections[${i}] needs id and title`);
    if (sectionIds.has(s.id)) fail(`duplicate section id "${s.id}"`);
    sectionIds.add(s.id);
  });
  const slugs = new Set();
  tools.forEach((t, i) => {
    if (!t?.slug || !/^[a-z0-9][a-z0-9-]*$/.test(t.slug)) fail(`tools[${i}] needs a slug like "my-tool"`);
    if (slugs.has(t.slug)) fail(`duplicate tool slug "${t.slug}"`);
    slugs.add(t.slug);
    if (!t.title) fail(`tool "${t.slug}" needs a title`);
    if (!t.url && !t.module) fail(`tool "${t.slug}" needs a url (or a module)`);
    if (!sectionIds.has(t.section)) fail(`tool "${t.slug}" uses unknown section "${t.section}"`);
    if (t.groups !== undefined && !Array.isArray(t.groups)) fail(`tool "${t.slug}" groups must be an array`);
  });
  return {
    name: raw.name || 'Tools',
    logo: raw.logo,
    lang: raw.lang || 'en',
    labels: { ...DEFAULT_LABELS, ...(raw.labels || {}) },
    basePath: normalizeBasePath(overrides.basePath ?? raw.basePath),
    sections: sections.map((s, i) => ({ order: i, ...s })),
    tools: tools.map((t) => ({ ...t, url: t.url || `/${t.slug}/` })),
    guidesDir: raw.guidesDir,
  };
}

/**
 * Load the config file named by TOOLHUB_CONFIG (default ./toolhub.config.js).
 * @param {NodeJS.ProcessEnv} env
 */
export async function loadConfig(env = process.env) {
  const file = path.resolve(env.TOOLHUB_CONFIG || 'toolhub.config.js');
  const mod = await import(pathToFileURL(file).href);
  const cfg = validateConfig(mod.default, { basePath: env.BASE_PATH });
  if (cfg.guidesDir) cfg.guidesDir = path.resolve(path.dirname(file), cfg.guidesDir);
  cfg.configDir = path.dirname(file);
  return cfg;
}
