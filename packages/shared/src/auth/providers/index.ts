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
  ANTHROPIC_OAUTH_CONFIG,
  startAnthropicLogin,
  getAnthropicAccessToken,
  getAnthropicBaseUrl,
} from './anthropic';

export {
  ANTIGRAVITY_OAUTH_CONFIG,
  startAntigravityLogin,
  getAntigravityAccessToken,
  getAntigravityBaseUrl,
} from './antigravity';

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

import type { OAuthProviderConfig } from '../types';
import { COPILOT_OAUTH_CONFIG } from './copilot';
import { ANTHROPIC_OAUTH_CONFIG } from './anthropic';
import { ANTIGRAVITY_OAUTH_CONFIG } from './antigravity';
import { CODEX_OAUTH_CONFIG } from './codex';
import { GEMINI_OAUTH_CONFIG } from './gemini';

// Registry of available OAuth providers
const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  copilot: COPILOT_OAUTH_CONFIG,
  anthropic: ANTHROPIC_OAUTH_CONFIG,
  antigravity: ANTIGRAVITY_OAUTH_CONFIG,
  codex: CODEX_OAUTH_CONFIG,
  gemini: GEMINI_OAUTH_CONFIG,
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
