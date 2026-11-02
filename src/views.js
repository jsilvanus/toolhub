const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Page shell.
 * @param {import('./config.js').HubConfig} config
 * @param {{ title?: string, body: string, user?: any, authMode?: string }} page
 */
export function layout(config, { title, body, user, authMode }) {
  const l = config.labels;
  const bp = config.basePath;
  const auth =
    authMode === 'oidc'
      ? user
        ? `<span>${esc(l.signedInAs)} ${esc(user.name || user.email || user.sub)}</span> <a href="${bp}/auth/logout">${esc(l.signOut)}</a>`
        : `<a href="${bp}/auth/login">${esc(l.signIn)}</a>`
      : '';
  return `<!doctype html>
<html lang="${esc(config.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} – ${config.name}` : config.name)}</title>
<link rel="stylesheet" href="${bp}/assets/style.css">
</head>
<body>
<header class="top">
  <a class="brand" href="${bp}/">${config.logo ? `<img src="${esc(config.logo)}" alt="" height="28"> ` : ''}${esc(config.name)}</a>
  <nav class="auth">${auth}</nav>
</header>
<main>${body}</main>
</body>
</html>`;
}

export function landing(config, sections, ctx) {
  const l = config.labels;
  const body = sections.length
    ? sections
        .map(
          (s) => `<section aria-labelledby="s-${esc(s.id)}">
<h2 id="s-${esc(s.id)}">${esc(s.title)}</h2>
${s.description ? `<p class="lead">${esc(s.description)}</p>` : ''}
<ul class="cards">
${s.tools
  .map(
    (t) => `<li class="card"><a class="card-link" href="${esc(t.href)}"${t.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>
${t.icon ? `<span class="icon" aria-hidden="true">${esc(t.icon)}</span>` : ''}<span class="card-title">${esc(t.title)}</span>
${t.description ? `<span class="card-desc">${esc(t.description)}</span>` : ''}</a>
${t.guideHref ? `<a class="guide-link" href="${esc(t.guideHref)}">${esc(l.guide)}</a>` : ''}</li>`,
  )
  .join('\n')}
${s.guides
  .map(
    (g) => `<li class="card"><a class="card-link" href="${esc(g.href)}"><span class="icon" aria-hidden="true">▶</span><span class="card-title">${esc(g.title)}</span>
${g.description ? `<span class="card-desc">${esc(g.description)}</span>` : ''}</a></li>`,
  )
  .join('\n')}
</ul>
</section>`,
        )
        .join('\n')
    : `<p>${esc(l.noTools)}</p>`;
  return layout(config, { body, ...ctx });
}
