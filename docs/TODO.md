# TODO

## Phase 1: foundation
- [x] Package scaffolding (ESM, scripts, ESLint, `tsc --noEmit`)
- [x] Config loader and validation (`TOOLHUB_CONFIG`, env overrides)
- [x] Registry: sections order, empty sections hidden, link building
- [x] Landing page (server-rendered, accessible cards, small CSS)
- [x] `BASE_PATH` support everywhere
- [x] `/health`
- [x] Tests

## Phase 2: auth
- [x] Signed session cookie
- [x] OIDC login, callback, logout (PKCE)
- [x] Group filtering of tools
- [x] `/auth/check` forward-auth endpoint
- [x] Tests

## Phase 3: guides and video
- [x] Markdown guides with front matter, safe rendering
- [x] Storage drivers: local (Range) and S3 (presigned URL)
- [x] Video route with group check, poster, captions
- [x] Group filtering of guides
- [x] Tests

## Phase 4: ops and packaging
- [x] `/metrics` gated by `METRICS_BEARER_TOKEN`
- [x] Pino logging
- [x] Dockerfile, example `docker-compose.yml` with Traefik labels
- [x] README (config reference, env vars, deploy, adding tools/guides/videos)

## Phase 5: module contract
- [x] JSDoc types for `manifest` / `createRouter(ctx)`
- [x] Module mounting under `{basePath}/<slug>/`
- [x] Example module
- [ ] `manifestUrl` periodic overlay (title/description)

## Later
- [ ] Per-group instances inside tools
- [ ] Runtime plugin loading (if ever needed)
