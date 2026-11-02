import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontMatter, loadGuides, renderGuide } from '../src/guides.js';
import { parseRange, createLocalStorage } from '../src/storage/local.js';
import { createS3Storage } from '../src/storage/s3.js';
import { baseRaw, start } from './helpers.js';

const GUIDE = `---
title: Intro
section: a
groups: [staff]
video: videos/a.mp4
poster: videos/a.jpg
captions:
  - fi=videos/a.fi.vtt
---
Hello <script>alert(1)</script>

::video[videos/b.mp4]
`;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-'));
  fs.mkdirSync(path.join(dir, 'guides'));
  fs.mkdirSync(path.join(dir, 'media/videos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'guides/intro.md'), GUIDE);
  fs.writeFileSync(path.join(dir, 'media/videos/a.mp4'), '0123456789');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'nope');
  return dir;
}

test('front matter parsing', () => {
  const { data, body } = parseFrontMatter(GUIDE);
  assert.equal(data.title, 'Intro');
  assert.deepEqual(data.groups, ['staff']);
  assert.deepEqual(data.captions, ['fi=videos/a.fi.vtt']);
  assert.match(body, /Hello/);
});

test('rendering escapes raw HTML and embeds videos with poster/captions', () => {
  const dir = setup();
  const [g] = loadGuides(path.join(dir, 'guides'));
  const html = renderGuide(g, '/hub');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<video controls preload="metadata" poster="/);
  assert.match(html, /<track kind="captions" srclang="fi"/);
  assert.match(html, /\/hub\/guides\/intro\/media\?key=videos%2Fb.mp4/);
});

test('parseRange', () => {
  assert.deepEqual(parseRange('bytes=0-3', 10), { start: 0, end: 3 });
  assert.deepEqual(parseRange('bytes=5-', 10), { start: 5, end: 9 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=0-99', 10), { start: 0, end: 9 });
  assert.equal(parseRange('bytes=20-30', 10), 'unsatisfiable');
  assert.equal(parseRange('nonsense', 10), null);
  assert.equal(parseRange(undefined, 10), null);
});

test('local video route: Range, allow-list, traversal', async () => {
  const dir = setup();
  const storage = createLocalStorage(path.join(dir, 'media'));
  const h = await start(baseRaw, { guides: loadGuides(path.join(dir, 'guides')), storage });
  try {
    const page = await fetch(`${h.url}/guides/intro`);
    assert.equal(page.status, 200);
    const url = `${h.url}/guides/intro/media?key=`;
    const full = await fetch(`${url}videos/a.mp4`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'video/mp4');
    assert.equal(await full.text(), '0123456789');
    const part = await fetch(`${url}videos/a.mp4`, { headers: { range: 'bytes=2-4' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 2-4/10');
    assert.equal(await part.text(), '234');
    assert.equal((await fetch(`${url}videos/a.mp4`, { headers: { range: 'bytes=50-' } })).status, 416);
    assert.equal((await fetch(`${url}../../secret.txt`)).status, 404); // not in the guide's allow-list
    assert.equal((await fetch(`${url}videos/other.mp4`)).status, 404);
    assert.equal((await fetch(`${h.url}/guides/missing`)).status, 404);
  } finally {
    await h.close();
  }
});

test('local storage refuses path traversal even for listed keys', async () => {
  const dir = setup();
  const storage = createLocalStorage(path.join(dir, 'media'));
  let status;
  await storage.serve({ headers: {} }, { status: (s) => ((status = s), { end() {} }) }, '../secret.txt');
  assert.equal(status, 400);
});

test('s3 storage redirects to a presigned URL', async () => {
  const storage = createS3Storage({ endpoint: 'http://minio.example.org:9000', bucket: 'media', accessKeyId: 'k', secretAccessKey: 's', urlTtlSeconds: 60 });
  const url = await storage.presign('videos/a.mp4');
  assert.match(url, /^http:\/\/minio\.example\.org:9000\/media\/videos\/a\.mp4\?/);
  assert.match(url, /X-Amz-Expires=60/);
  assert.match(url, /X-Amz-Signature=/);
  const out = {};
  await storage.serve({}, { set() {}, redirect: (c, u) => Object.assign(out, { c, u }) }, 'videos/a.mp4');
  assert.equal(out.c, 302);
});

test('guide requires group when auth is on', async () => {
  const dir = setup();
  const { sign } = await import('../src/auth/session.js');
  const secret = 'z'.repeat(40);
  const auth = { mode: 'oidc', secret, groupsClaim: 'groups', secure: false, oidc: {} };
  const h = await start(baseRaw, { auth, guides: loadGuides(path.join(dir, 'guides')) });
  try {
    const anon = await fetch(`${h.url}/guides/intro`, { redirect: 'manual' });
    assert.equal(anon.status, 302);
    const wrong = sign({ sub: '1', groups: ['other'] }, secret, 60);
    assert.equal((await fetch(`${h.url}/guides/intro`, { headers: { cookie: `toolhub_session=${wrong}` } })).status, 403);
    const ok = sign({ sub: '1', groups: ['staff'] }, secret, 60);
    assert.equal((await fetch(`${h.url}/guides/intro`, { headers: { cookie: `toolhub_session=${ok}` } })).status, 200);
  } finally {
    await h.close();
  }
});
