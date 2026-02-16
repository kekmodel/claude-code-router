/**
 * Antigravity OAuth provider
 * Uses Google OAuth to authenticate with the Antigravity Cloud Code Assist proxy.
 * Antigravity proxies both Gemini and Claude models via Google's Cloud Code endpoints.
 *
 * Credentials are from the opencode-antigravity-auth npm package.
 * Per Google's docs: "the client secret is obviously not treated as a secret"
 * for installed applications.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { startAuthCodeLogin } from "../oauth/authorizationCode";
import { getToken, saveToken, isTokenExpired, calculateExpiry } from "../tokenStore";
import { refreshAccessToken } from "../oauth/tokenRefresh";

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

const ANTIGRAVITY_ENDPOINT_DAILY_PROD = "https://daily-cloudcode-pa.googleapis.com";

// Endpoints tried in order when fetching the project ID
const ANTIGRAVITY_LOAD_ENDPOINTS = [
  ANTIGRAVITY_ENDPOINT_DAILY_PROD,
  "https://cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
];

const ANTIGRAVITY_DEFAULT_PROJECT_ID = "";

async function fetchProjectId(accessToken: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "antigravity/1.15.8 darwin/arm64",
    "Client-Metadata": JSON.stringify({
      ideType: "ANTIGRAVITY",
      platform: "MACOS",
      pluginType: "GEMINI",
    }),
  };

  for (const baseEndpoint of ANTIGRAVITY_LOAD_ENDPOINTS) {
    try {
      const response = await fetch(`${baseEndpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: {
            // Use numeric protobuf enum values (string names cause 400)
            ideType: 9,
            platform: 2,
            pluginType: 2,
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

export async function startAntigravityLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  return startAuthCodeLogin(ANTIGRAVITY_OAUTH_CONFIG, "antigravity", {
    onTokensReceived: async (tokens) => {
      const projectId = await fetchProjectId(tokens.access_token);
      return { refresh: `${tokens.refresh_token || ""}|${projectId}` };
    },
  });
}

/** Parse the pipe-separated refresh string into { refreshToken, projectId }. */
function parseRefreshParts(refresh: string): { refreshToken: string; projectId: string } {
  const [refreshToken = "", projectId = ""] = (refresh || "").split("|");
  return { refreshToken, projectId: projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID };
}

/**
 * Get a valid Antigravity access token, refreshing if expired.
 * Custom refresh flow: parses pipe-separated refresh string and re-fetches project ID.
 */
export async function getAntigravityAccessToken(): Promise<string> {
  const token = await getToken("antigravity");
  if (!token || token.type !== "oauth") {
    throw new Error(
      "Not authenticated with antigravity. Run `ccr auth login antigravity` first."
    );
  }

  if (!isTokenExpired(token)) {
    return token.access;
  }

  const { refreshToken, projectId } = parseRefreshParts(token.refresh);
  if (!refreshToken) {
    throw new Error(
      "Token expired for antigravity. Run `ccr auth login antigravity` again."
    );
  }

  try {
    const newTokens = await refreshAccessToken(ANTIGRAVITY_OAUTH_CONFIG, refreshToken);

    let freshProjectId = projectId;
    try {
      freshProjectId = await fetchProjectId(newTokens.access_token) || projectId;
    } catch {
      // Keep existing project ID if fetch fails
    }

    const updatedToken: OAuthToken = {
      ...token,
      access: newTokens.access_token,
      refresh: `${newTokens.refresh_token || refreshToken}|${freshProjectId}`,
      expires: calculateExpiry(newTokens.expires_in),
    };
    await saveToken("antigravity", updatedToken);
    return updatedToken.access;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Token expired")) throw error;
    throw new Error(
      "Failed to refresh antigravity token. Run `ccr auth login antigravity` again."
    );
  }
}

export async function getAntigravityProjectId(): Promise<string> {
  const token = await getToken("antigravity");
  if (!token || token.type !== "oauth") {
    return ANTIGRAVITY_DEFAULT_PROJECT_ID;
  }
  return parseRefreshParts(token.refresh).projectId;
}

export function getAntigravityBaseUrl(): string {
  return ANTIGRAVITY_ENDPOINT_DAILY_PROD;
}
