import type { OAuthProviderConfig, OAuthTokenResponse, OAuthToken } from "../types";
import { getToken, saveToken, isTokenExpired, calculateExpiry } from "../tokenStore";
import { postOAuthForm } from "./http";

export async function refreshAccessToken(
  config: OAuthProviderConfig,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  return postOAuthForm<OAuthTokenResponse>({
    url: config.tokenUrl,
    params: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    extraHeaders: config.extraHeaders,
    requestErrorPrefix: "Token refresh failed",
    oauthErrorPrefix: "Token refresh error",
  });
}

async function refreshAndSaveOAuthToken(
  providerName: string,
  config: OAuthProviderConfig,
  token: OAuthToken
): Promise<OAuthToken> {
  const refreshed = await refreshAccessToken(config, token.refresh);
  const updatedToken: OAuthToken = {
    ...token,
    access: refreshed.access_token,
    refresh: refreshed.refresh_token || token.refresh,
    expires: calculateExpiry(refreshed.expires_in),
  };
  await saveToken(providerName, updatedToken);
  return updatedToken;
}

/**
 * Get a valid OAuth access token, refreshing if expired. Throws on failure.
 * Used by providers with standard refresh flows (codex, gemini, anthropic).
 */
export async function getOAuthAccessToken(
  providerName: string,
  config: OAuthProviderConfig
): Promise<string> {
  const token = await getToken(providerName);
  if (!token || token.type !== "oauth") {
    throw new Error(
      `Not authenticated with ${providerName}. Run \`ccr auth login ${providerName}\` first.`
    );
  }

  if (!isTokenExpired(token)) {
    return token.access;
  }

  if (!token.refresh) {
    throw new Error(
      `Token expired for ${providerName}. Run \`ccr auth login ${providerName}\` again.`
    );
  }

  try {
    const updatedToken = await refreshAndSaveOAuthToken(providerName, config, token);
    return updatedToken.access;
  } catch (error) {
    console.error(`Token refresh failed for ${providerName}:`, error instanceof Error ? error.message : error);
    throw new Error(
      `Failed to refresh token for ${providerName}. Run \`ccr auth login ${providerName}\` again.`
    );
  }
}

/**
 * Get a valid access token for a provider, refreshing if necessary.
 * Returns null instead of throwing — suitable for callers that handle missing auth silently.
 */
export async function getValidToken(
  providerName: string,
  config: OAuthProviderConfig
): Promise<string | null> {
  const token = await getToken(providerName);
  if (!token) return null;
  if (token.type === 'api') return token.key;
  if (!isTokenExpired(token)) return token.access;
  if (!token.refresh) return null;

  try {
    const updatedToken = await refreshAndSaveOAuthToken(providerName, config, token);
    return updatedToken.access;
  } catch (error) {
    console.error(`Token refresh failed for ${providerName}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
