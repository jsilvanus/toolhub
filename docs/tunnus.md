# Using toolhub with Tunnus

[Tunnus](https://github.com/jsilvanus/tunnus) is a small OpenID Connect provider (email-code sign-in, `groups` claim). toolhub works with it as a relying party; no Tunnus-specific code is needed.

## Tunnus client entry

```json
{
  "client_id": "toolhub",
  "client_secret": "${TOOLHUB_CLIENT_SECRET}",
  "redirect_uris": ["https://tools.example.org/hub/auth/callback"],
  "post_logout_redirect_uris": ["https://tools.example.org/hub/auth/signed-out"],
  "token_endpoint_auth_method": "client_secret_post",
  "first_party": true,
  "always_include_groups": true
}
```

## toolhub environment

```
BASE_PATH=/hub
AUTH_MODE=oidc
SESSION_SECRET=<32+ random characters>
OIDC_ISSUER_URL=https://tools.example.org/id     # exactly Tunnus's ISSUER, no trailing slash
OIDC_CLIENT_ID=toolhub
OIDC_CLIENT_SECRET=<same as TOOLHUB_CLIENT_SECRET>
OIDC_CLIENT_AUTH=post                            # or basic, matching the client entry
OIDC_REDIRECT_URI=https://tools.example.org/hub/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=https://tools.example.org/hub/auth/signed-out
```

Points that must match:

- **Issuer** is compared exactly, including any path prefix.
- **Groups** are read from the `groups` claim of the ID token (`OIDC_GROUPS_CLAIM`). `always_include_groups` makes Tunnus send it; toolhub also requests the `groups` scope.
- **Client authentication** is `client_secret_post` by default; set `OIDC_CLIENT_AUTH=basic` for `client_secret_basic`.
- **Logout** redirects to Tunnus `end_session_endpoint` with `client_id` and the post-logout URL. Tunnus asks the user to confirm, then returns to `/auth/signed-out`.

## Verified

A real sign-in was run against Tunnus (authorization code flow with PKCE) with toolhub at `BASE_PATH=/hub`: redirect to Tunnus, email code, return to toolhub, cards filtered by the `all` group (a card needing the `admins` group stayed hidden), `/auth/check` returned the email and groups headers, and logout ended the Tunnus session.
