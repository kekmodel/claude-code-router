/**
 * OpenAI Codex OAuth provider
 * Uses Authorization Code + PKCE flow to authenticate with OpenAI.
 * The access_token from the OAuth flow is used directly as the API credential.
 * Requires ChatGPT Plus/Pro subscription.
 */

import { randomBytes } from "node:crypto";
import type { OAuthProviderConfig, OAuthToken } from "../types";
import { generatePKCE, startAuthCodeFlow, exchangeCodeForToken } from "../oauth/authorizationCode";
import { getToken, saveToken } from "../tokenStore";
import { refreshAccessToken } from "../oauth/tokenRefresh";

export const CODEX_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "codex",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  scopes: ["openid", "profile", "email", "offline_access"],
  authorizationUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  callbackPort: 1455,
  callbackPath: "/auth/callback",
};

/**
 * Extract chatgpt_account_id from the id_token JWT claims.
 * Checks root-level and nested claim paths.
 */
function extractAccountId(idToken: string): string | undefined {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    // Check root-level claim
    if (payload.chatgpt_account_id) return payload.chatgpt_account_id;
    // Check nested claim path (https://api.openai.com/auth)
    const authClaims = payload["https://api.openai.com/auth"];
    if (authClaims?.chatgpt_account_id) return authClaims.chatgpt_account_id;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Start OpenAI Codex login via Authorization Code + PKCE
 */
export async function startCodexLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  const pkce = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const { authUrl, waitForCallback, server, pkce: activePkce } = await startAuthCodeFlow(
    CODEX_OAUTH_CONFIG,
    pkce,
    state
  );

  return {
    authUrl,
    waitForAuth: async () => {
      try {
        const code = await waitForCallback();

        const tokens = await exchangeCodeForToken(
          CODEX_OAUTH_CONFIG,
          code,
          activePkce.codeVerifier
        );

        // Use access_token directly as the API credential
        const accountId = tokens.id_token
          ? extractAccountId(tokens.id_token)
          : undefined;

        const oauthToken: OAuthToken = {
          type: "oauth",
          access: tokens.access_token,
          refresh: tokens.refresh_token || "",
          expires: tokens.expires_in
            ? Date.now() + tokens.expires_in * 1000
            : Date.now() + 3600 * 1000, // Default 1 hour
          accountId,
        };

        await saveToken("codex", oauthToken);
        return oauthToken;
      } finally {
        server.close();
      }
    },
  };
}

/**
 * Get a valid OpenAI Codex access token, refreshing if needed.
 */
export async function getCodexAccessToken(): Promise<string> {
  const token = await getToken("codex");
  if (!token || token.type !== "oauth") {
    throw new Error(
      "Not authenticated with OpenAI Codex. Run `ccr auth login codex` first."
    );
  }

  // Check if token is still valid (with 60s buffer)
  if (Date.now() < token.expires - 60_000) {
    return token.access;
  }

  // Token expired, try to refresh
  if (token.refresh) {
    try {
      const newTokens = await refreshAccessToken(
        CODEX_OAUTH_CONFIG,
        token.refresh
      );

      const updatedToken: OAuthToken = {
        ...token,
        access: newTokens.access_token,
        refresh: newTokens.refresh_token || token.refresh,
        expires: newTokens.expires_in
          ? Date.now() + newTokens.expires_in * 1000
          : Date.now() + 3600 * 1000,
      };
      await saveToken("codex", updatedToken);
      return updatedToken.access;
    } catch (error) {
      console.error("Failed to refresh OpenAI Codex token:", error);
      throw new Error(
        "Failed to refresh OpenAI Codex token. Run `ccr auth login codex` again."
      );
    }
  }

  throw new Error(
    "OpenAI Codex token expired and no refresh token available. Run `ccr auth login codex` again."
  );
}

/**
 * Get extra headers required by the Codex API (chatgpt-account-id).
 */
export async function getCodexExtraHeaders(): Promise<Record<string, string>> {
  const token = await getToken("codex");
  if (token?.type === "oauth" && token.accountId) {
    return { "chatgpt-account-id": token.accountId };
  }
  return {};
}

/**
 * Get the Codex API base URL
 */
export function getCodexBaseUrl(): string {
  return "https://chatgpt.com/backend-api/codex/responses";
}
