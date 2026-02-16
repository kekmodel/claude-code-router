/**
 * Anthropic Claude OAuth provider
 * Uses Authorization Code + PKCE flow.
 *
 * WARNING: Anthropic may restrict third-party OAuth access through ToS changes.
 * Use at your own risk. This feature may stop working if Anthropic changes their policies.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { startAuthCodeLogin } from "../oauth/authorizationCode";
import { getToken, saveToken, isTokenExpired, calculateExpiry } from "../tokenStore";
import { refreshAccessToken } from "../oauth/tokenRefresh";

// Anthropic OAuth configuration (from Claude Code CLI)
export const ANTHROPIC_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "anthropic",
  clientId: "claude-code-cli",
  scopes: ["anthropic.claude"],
  authorizationUrl: "https://auth.anthropic.com/oauth2/auth",
  tokenUrl: "https://auth.anthropic.com/oauth2/token",
  callbackPort: 3000,
};

// Default Anthropic API base URL
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";

/**
 * Start Anthropic OAuth login via Authorization Code + PKCE
 * Returns the authorization URL and a wait function
 */
export async function startAnthropicLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  return startAuthCodeLogin(ANTHROPIC_OAUTH_CONFIG, "anthropic");
}

/**
 * Get a valid Anthropic access token, refreshing if needed
 */
export async function getAnthropicAccessToken(): Promise<string> {
  const token = await getToken("anthropic");
  if (!token || token.type !== "oauth") {
    throw new Error(
      "Not authenticated with Anthropic. Run `ccr auth login anthropic` first."
    );
  }

  if (!isTokenExpired(token)) {
    return token.access;
  }

  if (!token.refresh) {
    throw new Error(
      "Anthropic token expired and no refresh token available. Run `ccr auth login anthropic` again."
    );
  }

  try {
    const refreshed = await refreshAccessToken(ANTHROPIC_OAUTH_CONFIG, token.refresh);
    const updatedToken: OAuthToken = {
      ...token,
      access: refreshed.access_token,
      refresh: refreshed.refresh_token || token.refresh,
      expires: calculateExpiry(refreshed.expires_in),
    };
    await saveToken("anthropic", updatedToken);
    return updatedToken.access;
  } catch (error) {
    throw new Error(
      "Failed to refresh Anthropic token. Run `ccr auth login anthropic` again."
    );
  }
}

/**
 * Get the default Anthropic API base URL
 */
export function getAnthropicBaseUrl(): string {
  return ANTHROPIC_DEFAULT_BASE_URL;
}
