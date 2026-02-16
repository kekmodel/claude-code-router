/**
 * OpenAI Codex OAuth provider
 * Uses Authorization Code + PKCE flow. Requires ChatGPT Plus/Pro subscription.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { startAuthCodeLogin } from "../oauth/authorizationCode";
import { getToken } from "../tokenStore";
import { getOAuthAccessToken } from "../oauth/tokenRefresh";

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
 */
function extractAccountId(idToken: string): string | undefined {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.chatgpt_account_id) return payload.chatgpt_account_id;
    const authClaims = payload["https://api.openai.com/auth"];
    return authClaims?.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

export async function startCodexLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  return startAuthCodeLogin(CODEX_OAUTH_CONFIG, "codex", {
    onTokensReceived: async (tokens) => ({
      accountId: tokens.id_token ? extractAccountId(tokens.id_token) : undefined,
    }),
  });
}

export async function getCodexAccessToken(): Promise<string> {
  return getOAuthAccessToken("codex", CODEX_OAUTH_CONFIG);
}

export async function getCodexExtraHeaders(): Promise<Record<string, string>> {
  const token = await getToken("codex");
  if (token?.type === "oauth" && token.accountId) {
    return { "chatgpt-account-id": token.accountId };
  }
  return {};
}

export function getCodexBaseUrl(): string {
  return "https://chatgpt.com/backend-api/codex/responses";
}
