/**
 * Antigravity OAuth provider
 * Uses Google OAuth to authenticate, then exchanges the Google token
 * for an Antigravity API token that provides access to Claude/Gemini models.
 */

import { randomBytes } from "node:crypto";
import type { OAuthProviderConfig, OAuthToken } from "../types";
import { generatePKCE, startAuthCodeFlow, exchangeCodeForToken } from "../oauth/authorizationCode";
import { getToken, saveToken } from "../tokenStore";

// Google OAuth configuration for Antigravity
export const ANTIGRAVITY_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "antigravity",
  clientId: "936733107187-4m7s50ke4hmqk29g28obkn72r20c195r.apps.googleusercontent.com",
  scopes: ["openid", "email", "profile"],
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  callbackPort: 8087,
  extraParams: {
    access_type: "offline",
    prompt: "consent",
  },
};

// Antigravity API endpoints
const ANTIGRAVITY_TOKEN_URL = "https://antigravity.tools/api/auth/google";
const ANTIGRAVITY_DEFAULT_BASE_URL = "https://antigravity.tools/api/v1";

export interface AntigravitySession {
  token: string;
  expires_at: number; // Unix timestamp in seconds
}

/**
 * Start Antigravity login via Google OAuth
 */
export async function startAntigravityLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  const pkce = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const { authUrl, waitForCallback, server } = startAuthCodeFlow(
    ANTIGRAVITY_OAUTH_CONFIG,
    pkce,
    state
  );

  return {
    authUrl,
    waitForAuth: async () => {
      try {
        const code = await waitForCallback();

        // Exchange code for Google tokens
        const googleTokens = await exchangeCodeForToken(
          ANTIGRAVITY_OAUTH_CONFIG,
          code,
          pkce.codeVerifier
        );

        // Exchange Google token for Antigravity session
        const session = await getAntigravitySession(googleTokens.access_token);

        const oauthToken: OAuthToken = {
          type: "oauth",
          access: session.token,
          refresh: googleTokens.refresh_token || googleTokens.access_token,
          expires: session.expires_at * 1000, // Convert to milliseconds
        };

        await saveToken("antigravity", oauthToken);
        return oauthToken;
      } finally {
        server.close();
      }
    },
  };
}

/**
 * Exchange a Google access token for an Antigravity session token
 */
async function getAntigravitySession(googleAccessToken: string): Promise<AntigravitySession> {
  const response = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      token: googleAccessToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Antigravity session: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<AntigravitySession>;
}

/**
 * Get a valid Antigravity access token, refreshing if needed
 */
export async function getAntigravityAccessToken(): Promise<string> {
  const token = await getToken("antigravity");
  if (!token || token.type !== "oauth") {
    throw new Error(
      "Not authenticated with Antigravity. Run `ccr auth login antigravity` first."
    );
  }

  // Check if token is still valid (with 60s buffer)
  if (Date.now() < token.expires - 60_000) {
    return token.access;
  }

  // Token expired, try to refresh using stored Google refresh token
  try {
    // First, try to refresh the Google token
    const googleRefreshResponse = await fetch(ANTIGRAVITY_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH_CONFIG.clientId,
        grant_type: "refresh_token",
        refresh_token: token.refresh,
      }).toString(),
    });

    if (!googleRefreshResponse.ok) {
      throw new Error("Google token refresh failed");
    }

    const googleTokens = await googleRefreshResponse.json() as { access_token: string; refresh_token?: string };

    // Exchange new Google token for Antigravity session
    const session = await getAntigravitySession(googleTokens.access_token);

    const updatedToken: OAuthToken = {
      ...token,
      access: session.token,
      refresh: googleTokens.refresh_token || token.refresh,
      expires: session.expires_at * 1000,
    };
    await saveToken("antigravity", updatedToken);

    return updatedToken.access;
  } catch (error) {
    throw new Error(
      "Failed to refresh Antigravity token. Run `ccr auth login antigravity` again."
    );
  }
}

/**
 * Get the default Antigravity API base URL
 */
export function getAntigravityBaseUrl(): string {
  return ANTIGRAVITY_DEFAULT_BASE_URL;
}
