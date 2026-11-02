import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from '../src/modules.js';
import { refreshManifests } from '../src/manifests.js';
import { validateConfig } from '../src/config.js';
import { start } from './helpers.js';

const raw = {
  sections: [{ id: 'a', title: 'A' }],
  tools: [{ slug: 'hello', title: 'Hello', module: '../examples/hello-module.js', section: 'a' }],
};

test('module is mounted under the base path', async () => {
  const config = validateConfig(raw, { basePath: '/hub' });
  config.configDir = new URL('../test/', import.meta.url).pathname;
  const modules = await loadModules(config);
  const h = await start(raw, { modules }, { basePath: '/hub' });
  try {
    const html = await (await fetch(`${h.url}/hub/hello/`)).text();
    assert.match(html, /Mounted at \/hub\/hello\//);
    const landing = await (await fetch(`${h.url}/hub/`)).text();
    assert.match(landing, /href="\/hub\/hello\/"/);
  } finally {
    await h.close();
  }
});

test('manifest overlay keeps config values on failure', async () => {
  const config = validateConfig({
    sections: [{ id: 'a', title: 'A' }],
    tools: [
      { slug: 'ok', title: 'Old', url: '/x', section: 'a', manifestUrl: 'https://ok.example.org/tool.json' },
      { slug: 'bad', title: 'Keep', url: '/y', section: 'a', manifestUrl: 'https://bad.example.org/tool.json' },
    ],
  });
  const warnings = [];
  const fetchFn = async (u) => {
    if (u.includes('bad')) throw new Error('down');
    return { ok: true, json: async () => ({ title: 'New', description: 'Fresh' }) };
  };
  await refreshManifests(config, { warn: (...a) => warnings.push(a) }, fetchFn);
  assert.equal(config.tools[0].title, 'New');
  assert.equal(config.tools[1].title, 'Keep');
  assert.equal(warnings.length, 1);
});
