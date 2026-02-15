/**
 * Token store - manages auth tokens in ~/.claude-code-router/auth.json
 * File permissions: 0o600 (owner read/write only)
 */

import fs from "node:fs/promises";
import { AUTH_FILE, HOME_DIR } from "../constants";
import type { AuthToken, AuthStore } from "./types";

/**
 * Ensure auth file exists with correct permissions
 */
async function ensureAuthFile(): Promise<void> {
  try {
    await fs.mkdir(HOME_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }

  try {
    await fs.access(AUTH_FILE);
  } catch {
    // File doesn't exist, create it
    await fs.writeFile(AUTH_FILE, JSON.stringify({}, null, 2), {
      mode: 0o600,
    });
  }
}

/**
 * Read the auth store from disk
 */
async function readStore(): Promise<AuthStore> {
  await ensureAuthFile();
  try {
    const content = await fs.readFile(AUTH_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write the auth store to disk with secure permissions
 */
async function writeStore(store: AuthStore): Promise<void> {
  await ensureAuthFile();
  await fs.writeFile(AUTH_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
  // Ensure permissions are correct on all platforms
  await fs.chmod(AUTH_FILE, 0o600);
}

/**
 * Get a token for a specific provider
 */
export async function getToken(provider: string): Promise<AuthToken | null> {
  const store = await readStore();
  return store[provider] || null;
}

/**
 * Save a token for a specific provider
 */
export async function saveToken(provider: string, token: AuthToken): Promise<void> {
  const store = await readStore();
  store[provider] = token;
  await writeStore(store);
}

/**
 * Delete a token for a specific provider
 */
export async function deleteToken(provider: string): Promise<boolean> {
  const store = await readStore();
  if (!(provider in store)) {
    return false;
  }
  delete store[provider];
  await writeStore(store);
  return true;
}

/**
 * List all stored tokens (with provider names)
 */
export async function listTokens(): Promise<{ provider: string; token: AuthToken }[]> {
  const store = await readStore();
  return Object.entries(store).map(([provider, token]) => ({
    provider,
    token,
  }));
}

/**
 * Check if an OAuth token is expired
 * Returns true if token is expired or will expire within the buffer period
 */
export function isTokenExpired(token: AuthToken, bufferMs: number = 60_000): boolean {
  if (token.type !== 'oauth') {
    return false; // API keys don't expire
  }
  return Date.now() >= (token.expires - bufferMs);
}

/**
 * Get a valid access token for a provider, returning null if expired
 */
export async function getValidAccessToken(provider: string): Promise<string | null> {
  const token = await getToken(provider);
  if (!token) {
    return null;
  }
  if (token.type === 'api') {
    return token.key;
  }
  if (isTokenExpired(token)) {
    return null; // Caller should handle refresh
  }
  return token.access;
}
