/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628)
 * Used for CLI-based authentication (e.g., GitHub Copilot)
 */

import type { OAuthProviderConfig, DeviceCodeResponse, OAuthTokenResponse } from "../types";
import { buildOAuthFormParams, buildOAuthHeaders, postOAuthForm } from "./http";

export async function requestDeviceCode(
  config: OAuthProviderConfig
): Promise<DeviceCodeResponse> {
  if (!config.deviceCodeUrl) {
    throw new Error(`Device code URL not configured for provider: ${config.name}`);
  }

  return postOAuthForm<DeviceCodeResponse>({
    url: config.deviceCodeUrl,
    params: {
      client_id: config.clientId,
      scope: config.scopes?.length ? config.scopes.join(" ") : undefined,
      ...(config.extraParams || {}),
    },
    extraHeaders: config.extraHeaders,
    requestErrorPrefix: "Failed to request device code",
  });
}

export async function pollForDeviceToken(
  config: OAuthProviderConfig,
  deviceCode: string,
  interval: number = 5,
  expiresIn: number = 900,
  onPoll?: () => void
): Promise<OAuthTokenResponse> {
  const pollIntervalMs = interval * 1000;
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    if (onPoll) onPoll();

    const params = buildOAuthFormParams({
      client_id: config.clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      ...(config.extraParams || {}),
    });

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: buildOAuthHeaders(config.extraHeaders),
      body: params.toString(),
    });

    const data = (await response.json()) as OAuthTokenResponse;

    if (data.error) {
      switch (data.error) {
        case "authorization_pending":
          continue;
        case "slow_down":
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        case "expired_token":
          throw new Error("Device code expired. Please try again.");
        case "access_denied":
          throw new Error("Authorization denied by user.");
        default:
          throw new Error(`OAuth error: ${data.error} - ${data.error_description || ""}`);
      }
    }

    if (data.access_token) {
      return data;
    }
  }

  throw new Error("Device code polling timed out.");
}
