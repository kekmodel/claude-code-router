/**
 * Google Gemini CLI OAuth provider
 * Uses Google OAuth to authenticate with Gemini Code Assist.
 *
 * Client ID and secret are from the official google-gemini/gemini-cli project.
 * Per Google's docs: "the client secret is obviously not treated as a secret"
 * for installed applications.
 * See: https://developers.google.com/identity/protocols/oauth2#installed
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { startAuthCodeLogin } from "../oauth/authorizationCode";
import { getToken, saveToken, isTokenExpired, calculateExpiry } from "../tokenStore";
import { refreshAccessToken } from "../oauth/tokenRefresh";

// Official Gemini CLI OAuth credentials (from google-gemini/gemini-cli)
export const GEMINI_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "gemini",
  clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
  clientSecret: "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",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  callbackPort: 8088,
  callbackPath: "/oauth2callback",
  callbackHost: "127.0.0.1",
  extraParams: {
    access_type: "offline",
    prompt: "consent",
  },
};

/**
 * Start Google Gemini login via Google OAuth
 */
export async function startGeminiLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  return startAuthCodeLogin(GEMINI_OAUTH_CONFIG, "gemini");
}

/**
 * Get a valid Gemini access token, refreshing if needed
 */
export async function getGeminiAccessToken(): Promise<string> {
  const token = await getToken("gemini");
  if (!token || token.type !== "oauth") {
    throw new Error(
      "Not authenticated with Google Gemini. Run `ccr auth login gemini` first."
    );
  }

  if (!isTokenExpired(token)) {
    return token.access;
  }

  if (!token.refresh) {
    throw new Error(
      "Gemini token expired and no refresh token available. Run `ccr auth login gemini` again."
    );
  }

  try {
    const newTokens = await refreshAccessToken(GEMINI_OAUTH_CONFIG, token.refresh);
    const updatedToken: OAuthToken = {
      ...token,
      access: newTokens.access_token,
      refresh: newTokens.refresh_token || token.refresh,
      expires: calculateExpiry(newTokens.expires_in),
    };
    await saveToken("gemini", updatedToken);
    return updatedToken.access;
  } catch (error) {
    console.error("Failed to refresh Google Gemini token:", error);
    throw new Error(
      "Failed to refresh Gemini token. Run `ccr auth login gemini` again."
    );
  }
}

/**
 * Get the Gemini API base URL (Cloud Code Assist endpoint)
 */
export function getGeminiBaseUrl(): string {
  return "https://generativelanguage.googleapis.com";
}
