import * as client from 'openid-client';

/**
 * Thin wrapper over openid-client so the rest of the app (and tests) depend on a small interface.
 * Discovery is lazy: the hub starts even if the provider is briefly down.
 *
 * @typedef {{
 *   authorizationUrl(p: { state: string, nonce: string, codeVerifier: string }): Promise<string>,
 *   callback(currentUrl: URL, checks: { state: string, nonce: string, codeVerifier: string }): Promise<Record<string, any>>,
 *   endSessionUrl(): Promise<string|null>,
 * }} OidcClient
 *
 * @param {{ issuerUrl: string, clientId: string, clientSecret?: string, redirectUri: string,
 *   postLogoutRedirectUri?: string, scope?: string, clientAuth?: 'post'|'basic' }} opts
 * @returns {OidcClient}
 */
export function createOidcClient(opts) {
  let configPromise;
  const getConfig = () => {
    configPromise ??= client
      .discovery(new URL(opts.issuerUrl), opts.clientId, opts.clientSecret, opts.clientAuth === 'basic' ? client.ClientSecretBasic(opts.clientSecret) : client.ClientSecretPost(opts.clientSecret), {
        execute: opts.issuerUrl.startsWith('http://') ? [client.allowInsecureRequests] : [],
      })
      .catch((err) => {
        configPromise = undefined; // retry on next request
        throw err;
      });
    return configPromise;
  };
  return {
    async authorizationUrl({ state, nonce, codeVerifier }) {
      const cfg = await getConfig();
      const url = client.buildAuthorizationUrl(cfg, {
        redirect_uri: opts.redirectUri,
        scope: opts.scope || 'openid profile email groups',
        state,
        nonce,
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
      });
      return url.href;
    },
    async callback(currentUrl, { state, nonce, codeVerifier }) {
      const cfg = await getConfig();
      const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      return /** @type {Record<string, any>} */ (tokens.claims());
    },
    async endSessionUrl() {
      try {
        const cfg = await getConfig();
        const params = opts.postLogoutRedirectUri
          ? { post_logout_redirect_uri: opts.postLogoutRedirectUri, client_id: opts.clientId }
          : {};
        return client.buildEndSessionUrl(cfg, params).href;
      } catch {
        return null; // provider has no end_session_endpoint
      }
    },
  };
}

export { client as _client };
export const randomState = client.randomState;
export const randomNonce = client.randomNonce;
export const randomCodeVerifier = client.randomPKCECodeVerifier;
