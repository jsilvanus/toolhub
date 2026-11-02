# toolhub

A small Node.js (ESM) tool hub: a landing page of tool cards grouped into **sections** (click a card to open the tool), plus **guide** pages that can embed videos stored in S3-compatible storage. Config-driven, no database, no admin UI. See [docs/plan.md](docs/plan.md).

```bash
npm install
cp toolhub.config.example.js toolhub.config.js
npm start            # http://localhost:3000
npm test && npm run lint && npm run typecheck
```

## Configuration

`toolhub.config.js` (path via `TOOLHUB_CONFIG`) default-exports:

| Key | Meaning |
|---|---|
| `name`, `logo?`, `lang?` | Title, logo URL, `<html lang>` |
| `labels?` | Override UI strings (`signIn`, `signOut`, `guide`, `guides`, `noTools`, `signedInAs`, `back`, `forbidden`, `notFound`) |
| `basePath?` | URL prefix, e.g. `/hub` (the `BASE_PATH` env wins) |
| `sections[]` | `{ id, title, description?, order }`; shown in `order`, empty sections hidden |
| `tools[]` | `{ slug, title, description?, icon?, url, section, groups?, newTab?, guide?, manifestUrl?, module? }` |
| `guidesDir?` | Directory of Markdown guides (relative to the config file) |

`url` may be relative (resolved against the base path) or absolute (an externally deployed app). `groups` restricts a tool to users with at least one of them; omitted means any signed-in user. With `manifestUrl`, the hub fetches `{ title, description }` JSON at start and every 10 minutes and overlays it; configured values stay if the fetch fails.

## Environment

See [.env.example](.env.example). Highlights: `BASE_PATH`, `PORT`, `AUTH_MODE=none|oidc`, `SESSION_SECRET`, `OIDC_*`, `STORAGE_DRIVER=local|s3`, `S3_*`, `METRICS_BEARER_TOKEN`.

## Auth

`AUTH_MODE=oidc` makes the hub an OIDC client (code flow + PKCE) of any standard provider. Register redirect URI `OIDC_REDIRECT_URI` (`{origin}{BASE_PATH}/auth/callback`) and make the ID token carry a `groups` claim (name configurable with `OIDC_GROUPS_CLAIM`). The session is a stateless signed cookie (HttpOnly, SameSite=Lax, `Path={BASE_PATH}`, Secure when the redirect URI is https), valid 8 hours.

`GET {BASE_PATH}/auth/check` is a forward-auth endpoint: `200` with `X-Toolhub-User-Email` and `X-Toolhub-User-Groups`, or `401`. See [docker-compose.example.yml](docker-compose.example.yml).

## Guides and video

Put `name.md` files in `guidesDir`; they appear at `{BASE_PATH}/guides/name`. Front matter:

```yaml
---
title: Getting started
description: Shown on the card
section: help          # section id; lists the guide on the landing page
groups: [staff]        # optional
video: videos/intro.mp4
poster: videos/intro.jpg
captions:
  - en=videos/intro.en.vtt
---
```

Use `::video[key]` on its own line to place a video inline. Raw HTML in Markdown is escaped. Only media keys named by the guide can be served.

Storage: `STORAGE_DRIVER=local` streams from `STORAGE_LOCAL_DIR` with HTTP Range support (development). `STORAGE_DRIVER=s3` redirects to a short-lived presigned URL on S3/MinIO (`S3_ENDPOINT`, `S3_BUCKET`, credentials; path-style addressing is on by default when an endpoint is set). Upload with e.g. `mc cp intro.mp4 myminio/toolhub-media/videos/`.

## Adding a tool

- **Link**: add an entry to `tools` with an absolute `url`.
- **Module**: set `module` to a package or a file relative to the config. It exports `manifest` and `createRouter(ctx)`; the hub mounts it at `{BASE_PATH}/<slug>/` behind the tool's group check. See [examples/hello-module.js](examples/hello-module.js).

## Ops

`GET {BASE_PATH}/health`; `GET {BASE_PATH}/metrics` (Prometheus, needs `Authorization: Bearer $METRICS_BEARER_TOKEN`, 404 when unset); Pino JSON logs. `docker build -t toolhub .`
