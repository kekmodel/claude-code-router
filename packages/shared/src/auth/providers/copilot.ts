/**
 * GitHub Copilot OAuth provider
 * Uses Device Code Flow to authenticate with GitHub,
 * then exchanges the GitHub token for a Copilot API token.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { requestDeviceCode, pollForDeviceToken } from "../oauth/deviceCode";
import { getToken, saveToken } from "../tokenStore";

// GitHub Copilot OAuth configuration
export const COPILOT_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "copilot",
  clientId: "Iv1.b507a08c87ecfe98", // VS Code Copilot client ID
  scopes: ["read:user"],
  deviceCodeUrl: "https://github.com/login/device/code",
  tokenUrl: "https://github.com/login/oauth/access_token",
};

// Copilot internal token endpoint
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";

// Default Copilot API base URL
const COPILOT_DEFAULT_BASE_URL = "https://api.githubcopilot.com";

// Copilot editor headers required for API calls
const COPILOT_EDITOR_HEADERS: Record<string, string> = {
  "editor-version": "vscode/1.95.0",
  "editor-plugin-version": "copilot/1.250.0",
  "copilot-language-server-version": "1.250.0",
};

export interface CopilotToken {
  token: string;
  expires_at: number; // Unix timestamp in seconds
  endpoints?: {
    api: string;
    proxy: string;
  };
}

/**
 * Run the GitHub Copilot Device Code Flow
 * Returns device code info for display to user
 */
export async function startCopilotLogin(): Promise<{
  userCode: string;
  verificationUri: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  const deviceCode = await requestDeviceCode(COPILOT_OAUTH_CONFIG);

  return {
    userCode: deviceCode.user_code,
    verificationUri: deviceCode.verification_uri,
    waitForAuth: async () => {
      // Poll for GitHub OAuth token
      const tokenResponse = await pollForDeviceToken(
        COPILOT_OAUTH_CONFIG,
        deviceCode.device_code,
        deviceCode.interval,
        deviceCode.expires_in
      );

      // Store the GitHub OAuth token (this is effectively the "refresh" token for Copilot)
      const oauthToken: OAuthToken = {
        type: 'oauth',
        access: tokenResponse.access_token,
        refresh: tokenResponse.access_token, // GitHub token IS the refresh token for Copilot
        expires: 0, // Will be set when we get a Copilot token
      };

      // Get initial Copilot token
      const copilotToken = await getCopilotApiToken(tokenResponse.access_token);
      oauthToken.access = copilotToken.token;
      oauthToken.expires = copilotToken.expires_at * 1000; // Convert to milliseconds

      await saveToken("copilot", oauthToken);
      return oauthToken;
    },
  };
}

/**
 * Exchange a GitHub OAuth token for a Copilot API token
 */
export async function getCopilotApiToken(githubToken: string): Promise<CopilotToken> {
  const response = await fetch(COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/json",
      ...COPILOT_EDITOR_HEADERS,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Copilot token: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<CopilotToken>;
}

/**
 * Get a valid Copilot API token, refreshing if needed
 * This is the function that gets wired to `LLMProvider.getApiKey`
 */
export async function getCopilotAccessToken(): Promise<string> {
  const token = await getToken("copilot");
  if (!token || token.type !== 'oauth') {
    throw new Error("Not authenticated with GitHub Copilot. Run `ccr auth login copilot` first.");
  }

  // Check if the Copilot token is still valid (with 60s buffer)
  if (Date.now() < (token.expires - 60_000)) {
    return token.access;
  }

  // Copilot token expired, get a new one using the stored GitHub token
  try {
    const copilotToken = await getCopilotApiToken(token.refresh);

    // Update stored token
    const updatedToken: OAuthToken = {
      ...token,
      access: copilotToken.token,
      expires: copilotToken.expires_at * 1000,
    };
    await saveToken("copilot", updatedToken);

    return copilotToken.token;
  } catch (error) {
    throw new Error(
      "Failed to refresh Copilot token. Your GitHub authorization may have expired. Run `ccr auth login copilot` again."
    );
  }
}

/**
 * Get Copilot-specific headers needed for API calls
 */
export function getCopilotHeaders(): Record<string, string> {
  return { ...COPILOT_EDITOR_HEADERS };
}

/**
 * Get the default Copilot API base URL
 */
export function getCopilotBaseUrl(): string {
  return COPILOT_DEFAULT_BASE_URL;
}
