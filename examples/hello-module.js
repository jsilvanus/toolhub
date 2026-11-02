import express from 'express';

/** @type {import('../src/modules.js').ToolManifest} */
export const manifest = { slug: 'hello', title: 'Hello', description: 'Example tool module' };

/** @param {import('../src/modules.js').ToolContext} ctx */
export function createRouter(ctx) {
  const r = express.Router();
  r.get('/', (_req, res) => res.type('html').send(`<h1>Hello</h1><p>Mounted at ${ctx.mountPath}/</p>`));
  return r;
}
