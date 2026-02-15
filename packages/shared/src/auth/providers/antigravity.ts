/**
 * Antigravity OAuth provider
 * Uses Google OAuth to authenticate with the Antigravity Cloud Code Assist proxy.
 * Antigravity proxies both Gemini and Claude models via Google's Cloud Code endpoints.
 *
 * Credentials are from the opencode-antigravity-auth npm package.
 * Per Google's docs: "the client secret is obviously not treated as a secret"
 * for installed applications.
 * See: https://developers.google.com/identity/protocols/oauth2#installed
 */

import { randomBytes } from "node:crypto";
import type { OAuthProviderConfig, OAuthToken } from "../types";
import { generatePKCE, startAuthCodeFlow, exchangeCodeForToken } from "../oauth/authorizationCode";
import { getToken, saveToken } from "../tokenStore";

// Official Antigravity OAuth credentials (from opencode-antigravity-auth)
export const ANTIGRAVITY_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "antigravity",
  clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  clientSecret: "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",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  callbackPort: 51121,
  callbackPath: "/oauth-callback",
  callbackHost: "localhost",
  extraParams: {
    access_type: "offline",
    prompt: "consent",
  },
};

// Antigravity API endpoints (fallback order: daily → autopush → prod)
const ANTIGRAVITY_ENDPOINT_DAILY = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const ANTIGRAVITY_ENDPOINT_AUTOPUSH = "https://autopush-cloudcode-pa.sandbox.googleapis.com";
const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";
const ANTIGRAVITY_LOAD_ENDPOINTS = [
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_ENDPOINT_DAILY,
  ANTIGRAVITY_ENDPOINT_AUTOPUSH,
];
const ANTIGRAVITY_DEFAULT_PROJECT_ID = "rising-fact-p41fc";

/**
 * Fetch the Antigravity project ID from the Cloud Code Assist API
 */
async function fetchProjectId(accessToken: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "Client-Metadata": JSON.stringify({
      ideType: "ANTIGRAVITY",
      platform: process.platform === "win32" ? "WINDOWS" : "MACOS",
      pluginType: "GEMINI",
    }),
  };

  for (const baseEndpoint of ANTIGRAVITY_LOAD_ENDPOINTS) {
    try {
      const url = `${baseEndpoint}/v1internal:loadCodeAssist`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: {
            ideType: "ANTIGRAVITY",
            platform: process.platform === "win32" ? "WINDOWS" : "MACOS",
            pluginType: "GEMINI",
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const data = await response.json() as any;
      if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
        return data.cloudaicompanionProject;
      }
      if (data.cloudaicompanionProject?.id) {
        return data.cloudaicompanionProject.id;
      }
    } catch {
      continue;
    }
  }

  return ANTIGRAVITY_DEFAULT_PROJECT_ID;
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

        const tokens = await exchangeCodeForToken(
          ANTIGRAVITY_OAUTH_CONFIG,
          code,
          pkce.codeVerifier
        );

        // Fetch project ID from Cloud Code Assist API
        const projectId = await fetchProjectId(tokens.access_token);

        // Store refresh token with project ID in pipe-separated format
        const storedRefresh = `${tokens.refresh_token || ""}|${projectId}`;

        const oauthToken: OAuthToken = {
          type: "oauth",
          access: tokens.access_token,
          refresh: storedRefresh,
          expires: tokens.expires_in
            ? Date.now() + tokens.expires_in * 1000
            : Date.now() + 3600 * 1000,
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
 * Parse stored refresh string into its parts
 */
function parseRefreshParts(refresh: string): { refreshToken: string; projectId: string } {
  const [refreshToken = "", projectId = ""] = (refresh || "").split("|");
  return { refreshToken, projectId: projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID };
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

  // Token expired, try to refresh
  const { refreshToken, projectId } = parseRefreshParts(token.refresh);
  if (!refreshToken) {
    throw new Error(
      "No refresh token available for Antigravity. Run `ccr auth login antigravity` again."
    );
  }

  try {
    const refreshResponse = await fetch(ANTIGRAVITY_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH_CONFIG.clientId,
        client_secret: ANTIGRAVITY_OAUTH_CONFIG.clientSecret!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!refreshResponse.ok) {
      throw new Error(`Token refresh failed: ${refreshResponse.status}`);
    }

    const newTokens = await refreshResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // Preserve project ID in the stored refresh string
    const newRefresh = `${newTokens.refresh_token || refreshToken}|${projectId}`;

    const updatedToken: OAuthToken = {
      ...token,
      access: newTokens.access_token,
      refresh: newRefresh,
      expires: newTokens.expires_in
        ? Date.now() + newTokens.expires_in * 1000
        : Date.now() + 3600 * 1000,
    };
    await saveToken("antigravity", updatedToken);
    return updatedToken.access;
  } catch (error) {
    console.error("Failed to refresh Antigravity token:", error);
    throw new Error(
      "Failed to refresh Antigravity token. Run `ccr auth login antigravity` again."
    );
  }
}

/**
 * Get the Antigravity API base URL (daily sandbox - same as CLIProxy)
 */
export function getAntigravityBaseUrl(): string {
  return ANTIGRAVITY_ENDPOINT_DAILY;
}
