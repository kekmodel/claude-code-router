/**
 * OAuth provider registry
 */

import type { OAuthProviderConfig } from '../types';
import { COPILOT_OAUTH_CONFIG } from './copilot';
import { CODEX_OAUTH_CONFIG } from './codex';
import { GEMINI_OAUTH_CONFIG } from './gemini';
import { ANTIGRAVITY_OAUTH_CONFIG } from './antigravity';

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
  getCodexExtraHeaders,
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
  getAntigravityProjectId,
  getAntigravityBaseUrl,
} from './antigravity';

const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  copilot: COPILOT_OAUTH_CONFIG,
  codex: CODEX_OAUTH_CONFIG,
  gemini: GEMINI_OAUTH_CONFIG,
  antigravity: ANTIGRAVITY_OAUTH_CONFIG,
};

export function getOAuthProviderConfig(name: string): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[name] || null;
}

export function getAvailableOAuthProviders(): string[] {
  return Object.keys(OAUTH_PROVIDERS);
}
