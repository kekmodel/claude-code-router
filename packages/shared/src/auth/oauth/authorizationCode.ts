/**
 * OAuth 2.0 Authorization Code Flow with PKCE
 * Used for browser-based authentication (e.g., OpenAI Codex, Google Gemini)
 */

import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { OAuthProviderConfig, OAuthTokenResponse, PKCEPair } from "../types";

// Track active callback servers per provider to prevent port conflicts
// when login is triggered multiple times (e.g., from the UI)
const activeServers = new Map<string, Server>();

/**
 * Generate PKCE code verifier and code challenge
 */
export function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Start a local HTTP server to receive the OAuth callback
 * Returns the authorization URL and a promise that resolves with the auth code
 */
export function startAuthCodeFlow(
  config: OAuthProviderConfig,
  pkce: PKCEPair,
  state: string
): {
  authUrl: string;
  waitForCallback: () => Promise<string>;
  server: Server;
} {
  if (!config.authorizationUrl) {
    throw new Error(`Authorization URL not configured for provider: ${config.name}`);
  }

  const port = config.callbackPort || 8085;
  const callbackPath = config.callbackPath || "/callback";
  const host = config.callbackHost || "localhost";
  const redirectUri = `http://${host}:${port}${callbackPath}`;

  // Close any existing callback server for this provider to avoid port conflicts
  const existingServer = activeServers.get(config.name);
  if (existingServer) {
    try { existingServer.close(); } catch {}
    activeServers.delete(config.name);
  }

  // Build authorization URL
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

  // Create local callback server
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

  server.listen(port);
  activeServers.set(config.name, server);

  const waitForCallback = async (): Promise<string> => {
    try {
      return await callbackPromise;
    } finally {
      server.close();
      activeServers.delete(config.name);
    }
  };

  return { authUrl, waitForCallback, server };
}

/**
 * Exchange authorization code for tokens
 */
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
