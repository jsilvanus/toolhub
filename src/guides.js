import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import MarkdownIt from 'markdown-it';
import { canAccess } from './registry.js';
import { layout, esc } from './views.js';
import { getUser } from './auth/index.js';

// html:false => raw HTML in Markdown is escaped, so rendered output needs no further sanitising.
const md = new MarkdownIt({ html: false, linkify: true });

/** Parse a tiny YAML subset: `key: value`, `key: [a, b]`, and `key:` followed by `- item` lines. */
export function parseFrontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === '') {
      data[k] = [];
      listKey = k;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      data[k] = v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
      listKey = null;
    } else {
      data[k] = unquote(v);
      listKey = null;
    }
  }
  return { data, body: src.slice(m[0].length) };
}
const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2');
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Load all `*.md` guides from a directory.
 * @typedef {{ slug: string, title: string, description?: string, section?: string, groups?: string[], videos: string[],
 *   poster?: string, captions: Array<{lang: string, key: string}>, body: string }} Guide
 * @returns {Guide[]}
 */
export function loadGuides(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const slug = f.slice(0, -3);
      const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      return {
        slug,
        title: data.title || slug,
        description: data.description,
        section: data.section,
        groups: data.groups ? asList(data.groups) : undefined,
        videos: asList(data.video),
        poster: data.poster,
        captions: asList(data.captions).map((c) => {
          const i = c.indexOf('=');
          return { lang: c.slice(0, i), key: c.slice(i + 1) };
        }),
        body,
      };
    });
}

/** Keys of media a guide is allowed to serve (anything else 404s: no arbitrary bucket reads). */
export function mediaKeys(guide) {
  const keys = new Set([...guide.videos, ...guide.captions.map((c) => c.key)]);
  for (const m of guide.body.matchAll(/^::video\[([^\]]+)\]\s*$/gm)) keys.add(m[1]);
  if (guide.poster) keys.add(guide.poster);
  return keys;
}

function videoHtml(guide, key, bp) {
  const src = `${bp}/guides/${encodeURIComponent(guide.slug)}/media?key=${encodeURIComponent(key)}`;
  const poster = guide.poster ? ` poster="${esc(`${bp}/guides/${guide.slug}/media?key=${encodeURIComponent(guide.poster)}`)}"` : '';
  const tracks = guide.captions
    .map((c) => `<track kind="captions" srclang="${esc(c.lang)}" label="${esc(c.lang)}" src="${esc(`${bp}/guides/${guide.slug}/media?key=${encodeURIComponent(c.key)}`)}">`)
    .join('');
  return `<video controls preload="metadata"${poster}><source src="${esc(src)}">${tracks}</video>`;
}

export function renderGuide(guide, bp) {
  const inline = [];
  const body = guide.body.replace(/^::video\[([^\]]+)\]\s*$/gm, (_m, key) => {
    inline.push(key);
    return `@@VIDEO${inline.length - 1}@@`;
  });
  let html = md.render(body);
  html = html.replace(/<p>@@VIDEO(\d+)@@<\/p>/g, (_m, i) => videoHtml(guide, inline[Number(i)], bp));
  const top = guide.videos.map((k) => videoHtml(guide, k, bp)).join('\n');
  return `${top}\n${html}`;
}

/**
 * @param {import('./config.js').HubConfig} config
 * @param {{ mode: 'none'|'oidc', secret: string }} auth
 * @param {import('./storage/index.js').Storage|null} storage
 * @param {Guide[]} guides
 */
export function guidesRouter(config, auth, storage, guides) {
  const r = express.Router();
  const bySlug = new Map(guides.map((g) => [g.slug, g]));

  /** Resolve guide + enforce group access; sends the response and returns null when denied. */
  function authorise(req, res) {
    const guide = bySlug.get(req.params.slug);
    if (!guide) {
      res.status(404).type('text').send(config.labels.notFound);
      return null;
    }
    const user = getUser(req, /** @type {any} */ (auth));
    if (auth.mode === 'oidc' && !user) {
      res.redirect(`${config.basePath}/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
      return null;
    }
    if (!canAccess(guide.groups, user, auth.mode)) {
      res.status(403).type('text').send(config.labels.forbidden);
      return null;
    }
    return { guide, user };
  }

  r.get('/guides/:slug', (req, res) => {
    const ctx = authorise(req, res);
    if (!ctx) return;
    const { guide, user } = ctx;
    const body = `<article class="prose"><h1>${esc(guide.title)}</h1>${renderGuide(guide, config.basePath)}</article>
<p><a href="${config.basePath}/">${esc(config.labels.back)}</a></p>`;
    res.type('html').send(layout(config, { title: guide.title, body, user, authMode: auth.mode }));
  });

  r.get('/guides/:slug/media', async (req, res, next) => {
    try {
      const ctx = authorise(req, res);
      if (!ctx) return;
      const key = String(req.query.key || '');
      if (!storage || !mediaKeys(ctx.guide).has(key)) return res.status(404).end();
      await storage.serve(req, res, key);
    } catch (err) {
      next(err);
    }
  });
  return r;
}
