/**
 * Google Gemini CLI OAuth provider
 * Uses Google OAuth to authenticate with Gemini Code Assist.
 *
 * Client ID and secret are from the official google-gemini/gemini-cli project.
 * Per Google's docs: "the client secret is obviously not treated as a secret"
 * for installed applications.
 */

import type { OAuthProviderConfig, OAuthToken } from "../types";
import { startAuthCodeLogin } from "../oauth/authorizationCode";
import { getOAuthAccessToken } from "../oauth/tokenRefresh";

export const GEMINI_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "gemini",
  clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
  clientSecret: "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",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  callbackPort: 8088,
  callbackPath: "/oauth2callback",
  callbackHost: "127.0.0.1",
  extraParams: {
    access_type: "offline",
    prompt: "consent",
  },
};

export async function startGeminiLogin(): Promise<{
  authUrl: string;
  waitForAuth: () => Promise<OAuthToken>;
}> {
  return startAuthCodeLogin(GEMINI_OAUTH_CONFIG, "gemini");
}

export async function getGeminiAccessToken(): Promise<string> {
  return getOAuthAccessToken("gemini", GEMINI_OAUTH_CONFIG);
}

export function getGeminiBaseUrl(): string {
  return "https://generativelanguage.googleapis.com";
}
