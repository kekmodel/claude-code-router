export interface OAuthToken {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
}

export interface ApiKeyToken {
  type: 'api';
  key: string;
}

export type AuthToken = OAuthToken | ApiKeyToken;

export interface AuthStore {
  [provider: string]: AuthToken;
}

export interface OAuthProviderConfig {
  name: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  deviceCodeUrl?: string;
  tokenUrl: string;
  authorizationUrl?: string;
  callbackPort?: number;
  callbackPath?: string;
  callbackHost?: string;
  extraHeaders?: Record<string, string>;
  extraParams?: Record<string, string>;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}
