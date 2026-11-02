/** @typedef {import('./config.js').HubConfig} HubConfig */
/** @typedef {import('./config.js').Tool} Tool */

/**
 * @typedef {{ sub?: string, email?: string, name?: string, groups: string[] }} User
 */

/** True if the user may see an item restricted to `groups` (undefined/empty = any signed-in user). */
export function canAccess(groups, user, authMode) {
  if (authMode === 'none') return true;
  if (!user) return false;
  if (!groups || groups.length === 0) return true;
  return groups.some((g) => user.groups.includes(g));
}

/** Build a link: relative paths get the base path prefix, absolute URLs are kept. */
export function link(basePath, url) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return url;
  const rel = url.startsWith('/') ? url : `/${url}`;
  return `${basePath}${rel}` || '/';
}

/**
 * Sections in order, each with the tools the user may see. Empty sections are dropped.
 * @param {HubConfig} config
 * @param {User|null} user
 * @param {'none'|'oidc'} authMode
 * @param {Array<{ slug: string, title: string, description?: string, section?: string, groups?: string[] }>} [guides]
 */
export function visibleSections(config, user, authMode, guides = []) {
  const sections = [...config.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sections
    .map((section) => {
      const tools = config.tools
        .filter((t) => t.section === section.id && canAccess(t.groups, user, authMode))
        .map((t) => ({
          ...t,
          href: link(config.basePath, t.url),
          guideHref: t.guide ? `${config.basePath}/guides/${t.guide}` : undefined,
        }));
      const sectionGuides = guides
        .filter((g) => g.section === section.id && canAccess(g.groups, user, authMode))
        .map((g) => ({ ...g, href: `${config.basePath}/guides/${g.slug}` }));
      return { ...section, tools, guides: sectionGuides };
    })
    .filter((s) => s.tools.length > 0 || s.guides.length > 0);
}
