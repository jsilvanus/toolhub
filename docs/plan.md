# toolhub plan

toolhub is a small Node.js (ESM) web app. It shows a landing page of tool cards grouped into **sections**; clicking a card opens the tool. It also serves **guide** pages that can embed videos stored in S3-compatible storage.

It is deliberately minimal: no database, no admin UI, no frontend framework. Everything comes from a config file and environment variables, so one generic image can serve any deployment. Branding, domains, tools and groups live in deployment config kept outside this repo; examples here use `example.org`.

## Goals

- Landing page: sections in a configured order, each with cards (real `<a>` links), empty sections hidden.
- Tools are either **links** (internal path or external URL) or, later, **modules** (`manifest` + `createRouter(ctx)`) mounted under the hub.
- Visibility by groups from an OIDC provider; a card or guide is shown only if the user has one of its groups.
- Works at a configurable `BASE_PATH` behind a reverse proxy that does **not** strip the prefix, or at a host root.
- Guides: Markdown pages, optionally with videos stored in S3/MinIO (or a local directory in development).
- Ops: health, bearer-gated Prometheus metrics, structured logs, Dockerfile, example compose with Traefik labels.

Out of scope for v1: admin UI, database, per-group instances inside tools, runtime plugin loading.

## Architecture

```
src/
  server.js      entry: load config + env, start HTTP server
  app.js         createApp(): wires middleware and routes under basePath
  config.js      load + validate toolhub.config.js, env parsing
  registry.js    sections/tools/guides model, group filtering, link building
  views.js       server-rendered HTML (escaped), small CSS served as a static asset
  auth/          session cookie (HMAC-signed), OIDC client (openid-client), forwardAuth
  guides.js      Markdown loading (front matter), rendering, routes
  storage/       local + s3 drivers (presigned URL / Range streaming)
  modules.js     optional tool module contract and mounting
  metrics.js     prom-client
```

### Config

`toolhub.config.js` (path via `TOOLHUB_CONFIG`) default-exports an object:

- `name`, `logo?`, `lang?`, `labels?` (UI string overrides), `basePath?` (env `BASE_PATH` wins)
- `sections[]`: `{ id, title, description?, order }`
- `tools[]`: `{ slug, title, description, icon?, url, section, groups?, newTab?, guide?, manifestUrl? }`
- `guides`: `{ dir, sections?: ... }` guide files carry their own front matter (`title`, `section`, `groups`, `video`, `poster`, `captions`)

Config is validated at startup with clear errors (unknown section, duplicate slug, bad URL).

### Base path

All links, assets, redirects and cookie `Path` are built from `basePath` by one helper. Routes are mounted on a router at `basePath`; nothing assumes the proxy strips the prefix.

### Auth

`AUTH_MODE=none|oidc`. In `oidc` mode the hub is an OIDC client (`openid-client`, code flow with PKCE). The session is a stateless HMAC-signed cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=basePath`) holding `sub`, `email`, `name`, `groups`. Groups come from `OIDC_GROUPS_CLAIM` (default `groups`). `GET {basePath}/auth/check` answers a reverse-proxy forward-auth subrequest: 200 with `X-Toolhub-User-Email` / `X-Toolhub-User-Groups`, or 401.

With `AUTH_MODE=none` everything is public and group restrictions are ignored (intended for development and fully public hubs).

### Guides and video

Markdown files in a directory, with front matter. Raw HTML in Markdown is disabled (markdown-it `html: false`), so no sanitizer is required. A `::video[key]` directive (or front-matter `video:` list) embeds `<video controls preload="metadata">` with optional poster and captions (`.vtt`). Video bytes never pass through guide HTML: the video route authorises by the guide's groups, then either 302-redirects to a short-lived **presigned S3 GET URL** (`STORAGE_DRIVER=s3`) or streams a file with **HTTP Range** support (`STORAGE_DRIVER=local`).

### Module contract

A tool package may export `manifest` (`slug`, `title`, `description`, `groups`) and `createRouter(ctx)`. The hub mounts it at `{basePath}/<slug>/`. v1 defines the contract with JSDoc types and one example in `examples/`; the main use is link cards.

## Phases

1. **Foundation**: repo scaffolding, config loading/validation, sections + cards landing page, base path, health, tests.
2. **Auth**: session cookie, OIDC login/callback/logout, group filtering, `/auth/check`.
3. **Guides and video**: Markdown guides, storage drivers, video route, group filtering.
4. **Ops and packaging**: metrics, logging, Dockerfile, example compose, README.
5. **Module contract**: types, mounting, example module; optional `manifestUrl` overlay.

See `docs/TODO.md` for the checklist.
