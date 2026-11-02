import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, normalizeBasePath } from '../src/config.js';
import { link, canAccess, visibleSections } from '../src/registry.js';
import { baseRaw, start } from './helpers.js';

test('config validation rejects unknown section, duplicate slug, bad slug', () => {
  assert.throws(() => validateConfig({ sections: [], tools: [{ slug: 'x', title: 'X', url: '/', section: 'nope' }] }), /unknown section/);
  const s = [{ id: 'a', title: 'A' }];
  assert.throws(() => validateConfig({ sections: s, tools: [{ slug: 'x', title: 'X', url: '/', section: 'a' }, { slug: 'x', title: 'Y', url: '/', section: 'a' }] }), /duplicate tool slug/);
  assert.throws(() => validateConfig({ sections: s, tools: [{ slug: 'Bad Slug', title: 'X', url: '/', section: 'a' }] }), /slug/);
});

test('normalizeBasePath and link building', () => {
  assert.equal(normalizeBasePath('hub/'), '/hub');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(link('/hub', '/two/'), '/hub/two/');
  assert.equal(link('/hub', 'two'), '/hub/two');
  assert.equal(link('', '/two/'), '/two/');
  assert.equal(link('/hub', 'https://x.example.org/a'), 'https://x.example.org/a');
});

test('sections are ordered and empty ones hidden', () => {
  const config = validateConfig(baseRaw);
  const s = visibleSections(config, null, 'none');
  assert.deepEqual(s.map((x) => x.id), ['a', 'b']);
});

test('group filtering', () => {
  const config = validateConfig(baseRaw);
  const staff = { groups: ['staff'] };
  assert.equal(canAccess(['staff'], staff, 'oidc'), true);
  assert.equal(canAccess(['admins'], staff, 'oidc'), false);
  assert.equal(canAccess(undefined, staff, 'oidc'), true);
  assert.equal(canAccess(['admins'], null, 'oidc'), false);
  const tools = visibleSections(config, staff, 'oidc').flatMap((s) => s.tools.map((t) => t.slug));
  assert.deepEqual(tools, ['one', 'two']);
});

test('landing page renders cards as links and honours base path', async () => {
  const h = await start(baseRaw, {}, { basePath: '/hub' });
  try {
    const html = await (await fetch(`${h.url}/hub/`)).text();
    assert.match(html, /<a class="card-link" href="https:\/\/tool.example.org\/">/);
    assert.match(html, /href="\/hub\/two\/"/);
    assert.match(html, /href="\/hub\/assets\/style.css"/);
    assert.ok(html.indexOf('First') < html.indexOf('Second'));
    assert.doesNotMatch(html, /Empty/);
    assert.equal((await fetch(`${h.url}/`)).status, 404);
    assert.equal((await (await fetch(`${h.url}/hub/health`)).json()).status, 'ok');
    assert.equal((await fetch(`${h.url}/hub/assets/style.css`)).status, 200);
  } finally {
    await h.close();
  }
});

test('metrics is gated by bearer token', async () => {
  const h = await start(baseRaw, { metricsToken: 'secret-token' });
  try {
    assert.equal((await fetch(`${h.url}/metrics`)).status, 401);
    const ok = await fetch(`${h.url}/metrics`, { headers: { authorization: 'Bearer secret-token' } });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /toolhub_http_requests_total/);
  } finally {
    await h.close();
  }
});

test('html in config text is escaped', async () => {
  const raw = { ...baseRaw, tools: [{ slug: 'x', title: '<script>alert(1)</script>', url: '/x', section: 'a' }] };
  const h = await start(raw);
  try {
    const html = await (await fetch(`${h.url}/`)).text();
    assert.doesNotMatch(html, /<script>alert/);
  } finally {
    await h.close();
  }
});
