/**
 * OAuth token refresh logic
 */

import type { OAuthProviderConfig, OAuthTokenResponse, OAuthToken } from "../types";
import { getToken, saveToken, isTokenExpired } from "../tokenStore";

/**
 * Refresh an OAuth token using the refresh token
 */
export async function refreshAccessToken(
  config: OAuthProviderConfig,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...(config.extraParams || {}),
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      ...(config.extraHeaders || {}),
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;

  if (data.error) {
    throw new Error(`Token refresh error: ${data.error} - ${data.error_description || ""}`);
  }

  return data;
}

/**
 * Get a valid access token for a provider, refreshing if necessary
 * Returns the access token string or null if no token is stored
 */
export async function getValidToken(
  providerName: string,
  config: OAuthProviderConfig
): Promise<string | null> {
  const token = await getToken(providerName);
  if (!token) {
    return null;
  }

  // API key tokens never expire
  if (token.type === 'api') {
    return token.key;
  }

  // Check if token is still valid
  if (!isTokenExpired(token)) {
    return token.access;
  }

  // Token is expired, try to refresh
  if (!token.refresh) {
    return null; // No refresh token, user needs to re-authenticate
  }

  try {
    const refreshed = await refreshAccessToken(config, token.refresh);

    // Save the new token
    const newToken: OAuthToken = {
      type: 'oauth',
      access: refreshed.access_token,
      refresh: refreshed.refresh_token || token.refresh, // Keep old refresh token if new one not provided
      expires: Date.now() + (refreshed.expires_in || 3600) * 1000,
      accountId: token.accountId,
    };

    await saveToken(providerName, newToken);
    return newToken.access;
  } catch (error) {
    console.error(`Token refresh failed for ${providerName}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
