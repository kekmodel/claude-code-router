/**
 * Anthropic Claude OAuth provider — Authorization Code + PKCE flow.
 *
 * WARNING: Anthropic may restrict third-party OAuth access through ToS changes.
 * Use at your own risk.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { startAuthCodeLogin } from "../oauth/authorizationCode";
import { getOAuthAccessToken } from "../oauth/tokenRefresh";

export const ANTHROPIC_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "anthropic",
  clientId: "claude-code-cli",
  scopes: ["anthropic.claude"],
  authorizationUrl: "https://auth.anthropic.com/oauth2/auth",
  tokenUrl: "https://auth.anthropic.com/oauth2/token",
  callbackPort: 3000,
};

const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";

export async function startAnthropicLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  return startAuthCodeLogin(ANTHROPIC_OAUTH_CONFIG, "anthropic");
}

export async function getAnthropicAccessToken(): Promise<string> {
  return getOAuthAccessToken("anthropic", ANTHROPIC_OAUTH_CONFIG);
}

export function getAnthropicBaseUrl(): string {
  return ANTHROPIC_DEFAULT_BASE_URL;
}
