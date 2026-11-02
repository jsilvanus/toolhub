import { validateConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

export const baseRaw = {
  name: 'Test Hub',
  sections: [
    { id: 'b', title: 'Second', order: 2 },
    { id: 'a', title: 'First', order: 1 },
    { id: 'empty', title: 'Empty', order: 3 },
  ],
  tools: [
    { slug: 'one', title: 'One', description: 'd1', url: 'https://tool.example.org/', section: 'a' },
    { slug: 'two', title: 'Two', url: '/two/', section: 'b', groups: ['staff'] },
    { slug: 'three', title: 'Three', url: 'three', section: 'b', groups: ['admins'] },
  ],
};

export async function start(raw = baseRaw, deps = {}, overrides = {}) {
  const config = validateConfig(raw, overrides);
  const app = await createApp(config, { auth: { mode: 'none', secret: '', groupsClaim: 'groups', secure: false }, ...deps });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, config, close: () => new Promise((r) => server.close(r)) };
}
