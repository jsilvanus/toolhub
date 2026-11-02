export default {
  name: 'E2E Hub',
  sections: [{ id: 'a', title: 'Tools' }],
  tools: [
    { slug: 'open', title: 'Open tool', url: '/x', section: 'a' },
    { slug: 'all-only', title: 'All group tool', url: '/y', section: 'a', groups: ['all'] },
    { slug: 'admins', title: 'Admin tool', url: '/z', section: 'a', groups: ['admins'] },
  ],
};
