/**
 * GitHub Copilot OAuth provider
 * Uses Device Code Flow to authenticate with GitHub,
 * then exchanges the GitHub token for a Copilot API token.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { requestDeviceCode, pollForDeviceToken } from "../oauth/deviceCode";
import { getToken, saveToken, isTokenExpired } from "../tokenStore";

export const COPILOT_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "copilot",
  clientId: "Iv1.b507a08c87ecfe98",
  scopes: ["read:user"],
  deviceCodeUrl: "https://github.com/login/device/code",
  tokenUrl: "https://github.com/login/oauth/access_token",
};

const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const COPILOT_DEFAULT_BASE_URL = "https://api.githubcopilot.com";

export const COPILOT_EDITOR_HEADERS: Record<string, string> = {
  "editor-version": "vscode/1.95.0",
  "editor-plugin-version": "copilot/1.250.0",
  "copilot-language-server-version": "1.250.0",
};

export interface CopilotToken {
  token: string;
  expires_at: number;
  endpoints?: {
    api: string;
    proxy: string;
  };
}

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
      const tokenResponse = await pollForDeviceToken(
        COPILOT_OAUTH_CONFIG,
        deviceCode.device_code,
        deviceCode.interval,
        deviceCode.expires_in
      );

      // GitHub token IS the refresh token for Copilot
      const oauthToken: OAuthToken = {
        type: 'oauth',
        access: tokenResponse.access_token,
        refresh: tokenResponse.access_token,
        expires: 0,
      };

      const copilotToken = await getCopilotApiToken(tokenResponse.access_token);
      oauthToken.access = copilotToken.token;
      oauthToken.expires = copilotToken.expires_at * 1000;

      await saveToken("copilot", oauthToken);
      return oauthToken;
    },
  };
}

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
 * Get a valid Copilot API token, refreshing via GitHub token if expired.
 * Copilot uses a custom refresh flow (not standard OAuth refresh_token).
 */
export async function getCopilotAccessToken(): Promise<string> {
  const token = await getToken("copilot");
  if (!token || token.type !== 'oauth') {
    throw new Error("Not authenticated with copilot. Run `ccr auth login copilot` first.");
  }

  if (!isTokenExpired(token)) {
    return token.access;
  }

  try {
    const copilotToken = await getCopilotApiToken(token.refresh);
    const updatedToken: OAuthToken = {
      ...token,
      access: copilotToken.token,
      expires: copilotToken.expires_at * 1000,
    };
    await saveToken("copilot", updatedToken);
    return copilotToken.token;
  } catch {
    throw new Error(
      "Failed to refresh Copilot token. Run `ccr auth login copilot` again."
    );
  }
}

export function getCopilotHeaders(): Record<string, string> {
  return { ...COPILOT_EDITOR_HEADERS };
}

export function getCopilotBaseUrl(): string {
  return COPILOT_DEFAULT_BASE_URL;
}
