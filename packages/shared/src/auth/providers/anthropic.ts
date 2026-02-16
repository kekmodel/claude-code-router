/**
 * Anthropic Claude OAuth provider
 * Uses Authorization Code + PKCE flow.
 *
 * WARNING: Anthropic may restrict third-party OAuth access through ToS changes.
 * Use at your own risk. This feature may stop working if Anthropic changes their policies.
 */

import { randomBytes } from "node:crypto";
import type { OAuthProviderConfig, OAuthToken } from "../types";
import { generatePKCE, startAuthCodeFlow, exchangeCodeForToken } from "../oauth/authorizationCode";
import { getToken, saveToken } from "../tokenStore";
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
  const pkce = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const { authUrl, waitForCallback, server, pkce: activePkce } = await startAuthCodeFlow(
    ANTHROPIC_OAUTH_CONFIG,
    pkce,
    state
  );

  return {
    authUrl,
    waitForAuth: async () => {
      try {
        const code = await waitForCallback();

        // Exchange code for tokens
        const tokenResponse = await exchangeCodeForToken(
          ANTHROPIC_OAUTH_CONFIG,
          code,
          activePkce.codeVerifier
        );

        const oauthToken: OAuthToken = {
          type: "oauth",
          access: tokenResponse.access_token,
          refresh: tokenResponse.refresh_token || "",
          expires: Date.now() + (tokenResponse.expires_in || 3600) * 1000,
        };

        await saveToken("anthropic", oauthToken);
        return oauthToken;
      } finally {
        server.close();
      }
    },
  };
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

  // Check if token is still valid (with 60s buffer)
  if (Date.now() < token.expires - 60_000) {
    return token.access;
  }

  // Token expired, try to refresh
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
      expires: Date.now() + (refreshed.expires_in || 3600) * 1000,
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
