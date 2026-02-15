/**
 * Auth token types and OAuth configuration
 */

// OAuth token stored after successful authentication
export interface OAuthToken {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number; // Unix timestamp in milliseconds
  accountId?: string;
}

// API key token (for unified storage)
export interface ApiKeyToken {
  type: 'api';
  key: string;
}

// Discriminated union for all token types
export type AuthToken = OAuthToken | ApiKeyToken;

// Token store file format: provider name → token
export interface AuthStore {
  [provider: string]: AuthToken;
}

// OAuth provider configuration
export interface OAuthProviderConfig {
  name: string;
  clientId: string;
  clientSecret?: string;       // Required by Google OAuth for installed apps
  scopes?: string[];
  deviceCodeUrl?: string;      // For Device Code Flow
  tokenUrl: string;
  authorizationUrl?: string;   // For Authorization Code Flow
  callbackPort?: number;       // Local callback server port
  callbackPath?: string;       // Custom callback path (default: /callback)
  extraHeaders?: Record<string, string>;
  extraParams?: Record<string, string>;
}

// Device Code Flow response (RFC 8628)
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

// OAuth token exchange response
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

// PKCE pair
export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}
