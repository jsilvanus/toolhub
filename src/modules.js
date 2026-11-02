import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { canAccess } from './registry.js';
import { getUser } from './auth/index.js';

/**
 * Tool module contract. A tool package (or local file) exports:
 *
 * @typedef {{ slug?: string, title?: string, description?: string, groups?: string[] }} ToolManifest
 * @typedef {{ basePath: string, mountPath: string, logger: any }} ToolContext
 * @typedef {{ manifest?: ToolManifest, createRouter(ctx: ToolContext): import('express').Router | Promise<import('express').Router> }} ToolModule
 */

/**
 * Import the module of every tool that declares `module` (a package name or a path relative to the config).
 * @param {import('./config.js').HubConfig} config
 * @returns {Promise<Array<{ tool: import('./config.js').Tool, mod: ToolModule }>>}
 */
export async function loadModules(config) {
  const out = [];
  for (const tool of config.tools.filter((t) => t.module)) {
    const spec = tool.module.startsWith('.') ? pathToFileURL(path.resolve(config.configDir || '.', tool.module)).href : tool.module;
    const mod = await import(spec);
    if (typeof mod.createRouter !== 'function') throw new Error(`Tool module "${tool.module}" must export createRouter(ctx)`);
    out.push({ tool, mod });
  }
  return out;
}

/** Mount modules at {basePath}/<slug>/ behind the tool's group check. */
export async function modulesRouter(config, auth, modules, logger) {
  const r = express.Router();
  for (const { tool, mod } of modules) {
    const mountPath = `${config.basePath}/${tool.slug}`;
    const sub = await mod.createRouter({ basePath: config.basePath, mountPath, logger });
    r.use(`/${tool.slug}`, (req, res, next) => {
      const user = getUser(req, auth);
      if (auth.mode === 'oidc' && !user) return res.redirect(`${config.basePath}/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
      if (!canAccess(tool.groups ?? mod.manifest?.groups, user, auth.mode)) return res.status(403).type('text').send(config.labels.forbidden);
      next();
    }, sub);
  }
  return r;
}
