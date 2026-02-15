/**
 * OAuth provider registry
 * Maps provider names to their OAuth implementation
 */

export {
  COPILOT_OAUTH_CONFIG,
  startCopilotLogin,
  getCopilotAccessToken,
  getCopilotApiToken,
  getCopilotHeaders,
  getCopilotBaseUrl,
} from './copilot';

export {
  CODEX_OAUTH_CONFIG,
  startCodexLogin,
  getCodexAccessToken,
  getCodexBaseUrl,
} from './codex';

export {
  GEMINI_OAUTH_CONFIG,
  startGeminiLogin,
  getGeminiAccessToken,
  getGeminiBaseUrl,
} from './gemini';

export {
  ANTIGRAVITY_OAUTH_CONFIG,
  startAntigravityLogin,
  getAntigravityAccessToken,
  getAntigravityBaseUrl,
} from './antigravity';

import type { OAuthProviderConfig } from '../types';
import { COPILOT_OAUTH_CONFIG } from './copilot';
import { CODEX_OAUTH_CONFIG } from './codex';
import { GEMINI_OAUTH_CONFIG } from './gemini';
import { ANTIGRAVITY_OAUTH_CONFIG } from './antigravity';

// Registry of available OAuth providers
const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  copilot: COPILOT_OAUTH_CONFIG,
  codex: CODEX_OAUTH_CONFIG,
  gemini: GEMINI_OAUTH_CONFIG,
  antigravity: ANTIGRAVITY_OAUTH_CONFIG,
};

/**
 * Get OAuth config for a provider name
 */
export function getOAuthProviderConfig(name: string): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[name] || null;
}

/**
 * Get list of available OAuth provider names
 */
export function getAvailableOAuthProviders(): string[] {
  return Object.keys(OAUTH_PROVIDERS);
}
