/**
 * Google Gemini CLI OAuth provider
 * Uses Google OAuth to authenticate with Gemini Code Assist.
 *
 * Client ID and secret are from the official google-gemini/gemini-cli project.
 * Per Google's docs: "the client secret is obviously not treated as a secret"
 * for installed applications.
 * See: https://developers.google.com/identity/protocols/oauth2#installed
 */

import { randomBytes } from "node:crypto";
import type { OAuthProviderConfig, OAuthToken } from "../types";
import { generatePKCE, startAuthCodeFlow, exchangeCodeForToken } from "../oauth/authorizationCode";
import { getToken, saveToken } from "../tokenStore";

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
  const pkce = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const { authUrl, waitForCallback, server, pkce: activePkce } = await startAuthCodeFlow(
    GEMINI_OAUTH_CONFIG,
    pkce,
    state
  );

  return {
    authUrl,
    waitForAuth: async () => {
      try {
        const code = await waitForCallback();

        const tokens = await exchangeCodeForToken(
          GEMINI_OAUTH_CONFIG,
          code,
          activePkce.codeVerifier
        );

        const oauthToken: OAuthToken = {
          type: "oauth",
          access: tokens.access_token,
          refresh: tokens.refresh_token || "",
          expires: tokens.expires_in
            ? Date.now() + tokens.expires_in * 1000
            : Date.now() + 3600 * 1000,
        };

        await saveToken("gemini", oauthToken);
        return oauthToken;
      } finally {
        server.close();
      }
    },
  };
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

  // Check if token is still valid (with 60s buffer)
  if (Date.now() < token.expires - 60_000) {
    return token.access;
  }

  // Token expired, try to refresh
  if (token.refresh) {
    try {
      const refreshResponse = await fetch(GEMINI_OAUTH_CONFIG.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: GEMINI_OAUTH_CONFIG.clientId,
          client_secret: GEMINI_OAUTH_CONFIG.clientSecret!,
          grant_type: "refresh_token",
          refresh_token: token.refresh,
        }).toString(),
      });

      if (!refreshResponse.ok) {
        throw new Error(`Token refresh failed: ${refreshResponse.status}`);
      }

      const newTokens = await refreshResponse.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const updatedToken: OAuthToken = {
        ...token,
        access: newTokens.access_token,
        refresh: newTokens.refresh_token || token.refresh,
        expires: newTokens.expires_in
          ? Date.now() + newTokens.expires_in * 1000
          : Date.now() + 3600 * 1000,
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

  throw new Error(
    "Gemini token expired and no refresh token available. Run `ccr auth login gemini` again."
  );
}

/**
 * Get the Gemini API base URL (Cloud Code Assist endpoint)
 */
export function getGeminiBaseUrl(): string {
  return "https://generativelanguage.googleapis.com";
}
