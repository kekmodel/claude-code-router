/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628)
 * Used for CLI-based authentication (e.g., GitHub Copilot)
 */

import type { OAuthProviderConfig, DeviceCodeResponse, OAuthTokenResponse } from "../types";

/**
 * Start the Device Code Flow by requesting a device code
 */
export async function requestDeviceCode(
  config: OAuthProviderConfig
): Promise<DeviceCodeResponse> {
  if (!config.deviceCodeUrl) {
    throw new Error(`Device code URL not configured for provider: ${config.name}`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    ...(config.scopes?.length ? { scope: config.scopes.join(" ") } : {}),
    ...(config.extraParams || {}),
  });

  const response = await fetch(config.deviceCodeUrl, {
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
    throw new Error(`Failed to request device code: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

/**
 * Poll the token endpoint until the user authorizes the device
 * Returns the token response or throws on error/expiry
 */
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

    const params = new URLSearchParams({
      client_id: config.clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
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

    const data = (await response.json()) as OAuthTokenResponse;

    if (data.error) {
      switch (data.error) {
        case "authorization_pending":
          // User hasn't authorized yet, keep polling
          continue;
        case "slow_down":
          // Increase interval
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
