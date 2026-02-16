/**
 * OAuth 2.0 Authorization Code Flow with PKCE
 * Used for browser-based authentication (e.g., OpenAI Codex, Google Gemini)
 */

import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { OAuthProviderConfig, OAuthTokenResponse, PKCEPair, OAuthToken } from "../types";
import { saveToken, calculateExpiry } from "../tokenStore";

// Track active flows per provider to prevent state mismatch and port conflicts
interface ActiveFlow {
  server: Server;
  authUrl: string;
  waitForCallback: () => Promise<string>;
  pkce: PKCEPair;
  state: string;
  timeout: ReturnType<typeof setTimeout>;
}
const activeFlows = new Map<string, ActiveFlow>();

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

function cleanupFlow(providerName: string): void {
  const flow = activeFlows.get(providerName);
  if (flow) {
    clearTimeout(flow.timeout);
    try { flow.server.close(); } catch {}
    activeFlows.delete(providerName);
  }
}

export function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Start a local HTTP server to receive the OAuth callback.
 * Reuses an active flow if one exists for this provider (prevents port conflicts).
 */
export async function startAuthCodeFlow(
  config: OAuthProviderConfig,
  pkce: PKCEPair,
  state: string
): Promise<{
  authUrl: string;
  waitForCallback: () => Promise<string>;
  server: Server;
  pkce: PKCEPair;
}> {
  if (!config.authorizationUrl) {
    throw new Error(`Authorization URL not configured for provider: ${config.name}`);
  }

  // Reuse existing active flow if the callback server is still listening
  const existing = activeFlows.get(config.name);
  if (existing && existing.server.listening) {
    clearTimeout(existing.timeout);
    existing.timeout = setTimeout(() => cleanupFlow(config.name), FLOW_TIMEOUT_MS);
    return {
      authUrl: existing.authUrl,
      waitForCallback: existing.waitForCallback,
      server: existing.server,
      pkce: existing.pkce,
    };
  }

  if (existing) {
    cleanupFlow(config.name);
  }

  const port = config.callbackPort || 8085;
  const callbackPath = config.callbackPath || "/callback";
  const host = config.callbackHost || "localhost";
  const redirectUri = `http://${host}:${port}${callbackPath}`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256",
    ...(config.scopes?.length ? { scope: config.scopes.join(" ") } : {}),
    ...(config.extraParams || {}),
  });

  const authUrl = `${config.authorizationUrl}?${params.toString()}`;

  let resolveCallback: (code: string) => void;
  let rejectCallback: (error: Error) => void;

  const callbackPromise = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    if (url.pathname === callbackPath) {
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        const errorDesc = url.searchParams.get("error_description") || error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Authorization Failed</h2><p>${errorDesc}</p><p>You can close this window.</p></body></html>`);
        rejectCallback(new Error(`OAuth error: ${errorDesc}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Invalid State</h2><p>State mismatch. Please try again.</p></body></html>`);
        rejectCallback(new Error("OAuth state mismatch"));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Missing Code</h2><p>No authorization code received.</p></body></html>`);
        rejectCallback(new Error("No authorization code received"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Authorization Successful</h2><p>You can close this window and return to the terminal.</p></body></html>`);
      resolveCallback(code);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(
          `Port ${port} is already in use. A previous login flow may still be active.\n` +
          `Try stopping the other process first, or run: lsof -ti:${port} | xargs kill`
        ));
      } else {
        reject(err);
      }
    });
    server.listen(port, () => resolve());
  });

  const waitForCallback = async (): Promise<string> => {
    try {
      return await callbackPromise;
    } finally {
      cleanupFlow(config.name);
    }
  };

  const timeout = setTimeout(() => cleanupFlow(config.name), FLOW_TIMEOUT_MS);
  activeFlows.set(config.name, { server, authUrl, waitForCallback, pkce, state, timeout });

  return { authUrl, waitForCallback, server, pkce };
}

/**
 * High-level Auth Code login: PKCE → auth code flow → token exchange → save.
 * Providers pass an optional hook to customize the token after exchange.
 */
export async function startAuthCodeLogin(
  config: OAuthProviderConfig,
  providerName: string,
  options?: {
    onTokensReceived?: (tokens: OAuthTokenResponse) => Promise<Partial<OAuthToken>>;
  }
): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  const pkce = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const { authUrl, waitForCallback, pkce: activePkce } = await startAuthCodeFlow(
    config,
    pkce,
    state
  );

  return {
    authUrl,
    waitForAuth: async () => {
      const code = await waitForCallback();
      const tokens = await exchangeCodeForToken(config, code, activePkce.codeVerifier);

      const oauthToken: OAuthToken = {
        type: "oauth",
        access: tokens.access_token,
        refresh: tokens.refresh_token || "",
        expires: calculateExpiry(tokens.expires_in),
        ...(options?.onTokensReceived ? await options.onTokensReceived(tokens) : {}),
      };

      await saveToken(providerName, oauthToken);
      return oauthToken;
    },
  };
}

export async function exchangeCodeForToken(
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthTokenResponse> {
  const port = config.callbackPort || 8085;
  const callbackPath = config.callbackPath || "/callback";
  const host = config.callbackHost || "localhost";
  const callbackUri = redirectUri || `http://${host}:${port}${callbackPath}`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUri,
    code_verifier: codeVerifier,
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
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;

  if (data.error) {
    throw new Error(`Token exchange error: ${data.error} - ${data.error_description || ""}`);
  }

  return data;
}
