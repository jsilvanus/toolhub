// Copy to toolhub.config.js (or point TOOLHUB_CONFIG at your own file).
export default {
  name: 'Example Tools',
  lang: 'en',
  // basePath: '/hub',            // or set BASE_PATH
  // labels: { signIn: '...' },   // override UI strings
  guidesDir: './guides',
  sections: [
    { id: 'daily', title: 'Daily tools', description: 'Things you use every day', order: 1 },
    { id: 'help', title: 'Help', order: 2 },
  ],
  tools: [
    { slug: 'planner', title: 'Planner', description: 'External app', url: 'https://planner.example.org/', section: 'daily', groups: ['staff'], newTab: true, guide: 'getting-started' },
    { slug: 'hello', title: 'Hello', description: 'Built-in example module', module: '../examples/hello-module.js', section: 'daily' },
  ],
};
