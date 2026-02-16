import { isTokenExpired } from "@CCR/shared";

export type ProviderAuthStatus = "not_authenticated" | "active" | "expired";

export type AuthCodeLoginResult = {
  authUrl: string;
  waitForAuth: () => Promise<unknown>;
};

export type AuthCodeProvider = {
  startLogin: () => Promise<AuthCodeLoginResult>;
  message: string;
};

export type RouterModelEntry = {
  value: string;
  label: string;
  provider: string;
  reasoningLevels?: string[];
  defaultReasoningLevel?: string;
};

export function createAuthCodeProviders(options: {
  startCodexLogin: () => Promise<AuthCodeLoginResult>;
  startGeminiLogin: () => Promise<AuthCodeLoginResult>;
  startAntigravityLogin: () => Promise<AuthCodeLoginResult>;
}): Record<string, AuthCodeProvider> {
  return {
    codex: {
      startLogin: options.startCodexLogin,
      message: "Visit the URL to authenticate with OpenAI Codex.",
    },
    gemini: {
      startLogin: options.startGeminiLogin,
      message: "Visit the URL to authenticate with Google for Gemini.",
    },
    antigravity: {
      startLogin: options.startAntigravityLogin,
      message: "Visit the URL to authenticate with Google for Antigravity.",
    },
  };
}

export function getProviderAuthState(token: any): {
  status: ProviderAuthStatus;
  expiresAt: number | null;
} {
  if (!token) {
    return { status: "not_authenticated", expiresAt: null };
  }
  if (token.type === "api") {
    return { status: "active", expiresAt: null };
  }
  return {
    status: isTokenExpired(token) ? "expired" : "active",
    expiresAt: token.expires ?? null,
  };
}

export function buildStaticRouterModels(providers: any[]): RouterModelEntry[] {
  const models: RouterModelEntry[] = [];
  for (const providerConfig of providers) {
    if (!providerConfig?.name || !Array.isArray(providerConfig.models)) continue;
    for (const model of providerConfig.models) {
      models.push({
        value: `${providerConfig.name},${model}`,
        label: `${providerConfig.name}, ${model}`,
        provider: providerConfig.name,
      });
    }
  }
  return models;
}
