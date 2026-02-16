/**
 * OAuth provider model fetcher
 * Fetches available models for each OAuth provider from their respective sources.
 */

import { getToken } from "./tokenStore";
import { getCopilotApiToken, COPILOT_EDITOR_HEADERS } from "./providers/copilot";
import { getAntigravityAccessToken } from "./providers/antigravity";

export interface OAuthModel {
  id: string;
  name?: string;
  provider: string;
  reasoningLevels?: string[];
  defaultReasoningLevel?: string;
  plans?: string[];
}

export async function fetchOAuthModels(provider: string): Promise<OAuthModel[]> {
  switch (provider) {
    case "copilot":
      return fetchCopilotModels();
    case "codex":
      return fetchCodexModels();
    case "gemini":
      return fetchGeminiModels();
    case "antigravity":
      return fetchAntigravityModels();
    default:
      throw new Error(`Unknown OAuth provider: ${provider}`);
  }
}

async function fetchCopilotModels(): Promise<OAuthModel[]> {
  const token = await getToken("copilot");
  if (!token || token.type !== "oauth") {
    throw new Error("Not authenticated with Copilot");
  }

  const copilotToken = await getCopilotApiToken(token.refresh);

  const response = await fetch("https://api.githubcopilot.com/models", {
    headers: {
      Authorization: `Bearer ${copilotToken.token}`,
      ...COPILOT_EDITOR_HEADERS,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Copilot models API failed: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const modelList = data.data || data.models || data;
  if (!Array.isArray(modelList)) {
    throw new Error("Copilot models API returned unexpected format");
  }

  const models: OAuthModel[] = [];
  for (const m of modelList) {
    const id = m.id || m.name || m.model;
    if (id) {
      models.push({ id, name: m.name || m.id, provider: "copilot" });
    }
  }

  if (models.length === 0) {
    throw new Error("Copilot models API returned empty list");
  }

  return models;
}

const CODEX_MODELS_URL =
  "https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/models.json";

async function fetchCodexModels(): Promise<OAuthModel[]> {
  const token = await getToken("codex");
  if (!token || token.type !== "oauth") {
    throw new Error("Not authenticated with Codex");
  }

  const response = await fetch(CODEX_MODELS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Codex CLI models: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const modelList = data.models || data;

  if (!Array.isArray(modelList) || modelList.length === 0) {
    throw new Error("Failed to parse models from Codex CLI models.json");
  }

  return modelList
    .sort((a: any, b: any) => {
      const aVisible = a.visibility === "list" ? 0 : 1;
      const bVisible = b.visibility === "list" ? 0 : 1;
      if (aVisible !== bVisible) return aVisible - bVisible;
      return (a.priority ?? 99) - (b.priority ?? 99);
    })
    .map((m: any) => {
      const model: OAuthModel = {
        id: m.slug,
        name: m.display_name || m.slug,
        provider: "codex",
      };
      if (Array.isArray(m.supported_reasoning_levels)) {
        model.reasoningLevels = m.supported_reasoning_levels.map(
          (r: any) => r.effort || r
        );
      }
      if (m.default_reasoning_level) {
        model.defaultReasoningLevel = m.default_reasoning_level;
      }
      if (Array.isArray(m.available_in_plans)) {
        model.plans = m.available_in_plans;
      }
      return model;
    });
}

const GEMINI_MODELS_URL =
  "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/packages/core/src/config/models.ts";

async function fetchGeminiModels(): Promise<OAuthModel[]> {
  const token = await getToken("gemini");
  if (!token || token.type !== "oauth") {
    throw new Error("Not authenticated with Gemini");
  }

  const response = await fetch(GEMINI_MODELS_URL, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Gemini CLI models: ${response.status}`);
  }

  const source = await response.text();
  const modelIds = new Set<string>();

  const stringLiterals = source.matchAll(/'(gemini-[\d]+(?:\.[\d]+)?-[a-z][a-z0-9-]*[a-z0-9])'/g);
  for (const m of stringLiterals) {
    if (!m[1].includes("embedding")) {
      modelIds.add(m[1]);
    }
  }

  if (modelIds.size === 0) {
    throw new Error("Failed to parse model IDs from Gemini CLI source");
  }

  return [...modelIds]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => {
      const model: OAuthModel = { id, name: id, provider: "gemini" };
      if (/^gemini-3[.-]/.test(id)) {
        model.reasoningLevels = ["minimal", "low", "medium", "high"];
        model.defaultReasoningLevel = "high";
      } else if (/^gemini-2\.5[.-]/.test(id)) {
        model.reasoningLevels = ["budget"];
        model.defaultReasoningLevel = "budget:8192";
      }
      return model;
    });
}

const ANTIGRAVITY_KNOWN_MODELS: OAuthModel[] = [
  { id: "antigravity-gemini-3-pro", name: "Gemini 3 Pro (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-pro-low", name: "Gemini 3 Pro Low (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-pro-high", name: "Gemini 3 Pro High (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-flash", name: "Gemini 3 Flash (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-flash-minimal", name: "Gemini 3 Flash Minimal (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-flash-low", name: "Gemini 3 Flash Low (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-flash-medium", name: "Gemini 3 Flash Medium (Antigravity)", provider: "antigravity" },
  { id: "antigravity-gemini-3-flash-high", name: "Gemini 3 Flash High (Antigravity)", provider: "antigravity" },
  { id: "antigravity-claude-sonnet-4-5", name: "Claude Sonnet 4.5 (Antigravity)", provider: "antigravity" },
  { id: "antigravity-claude-sonnet-4-5-thinking", name: "Claude Sonnet 4.5 Thinking (Antigravity)", provider: "antigravity" },
  { id: "antigravity-claude-opus-4-5-thinking", name: "Claude Opus 4.5 Thinking (Antigravity)", provider: "antigravity" },
  { id: "antigravity-claude-opus-4-6-thinking", name: "Claude Opus 4.6 Thinking (Antigravity)", provider: "antigravity" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "antigravity" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "antigravity" },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", provider: "antigravity" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", provider: "antigravity" },
];

async function fetchAntigravityModels(): Promise<OAuthModel[]> {
  const token = await getToken("antigravity");
  if (!token || token.type !== "oauth") {
    throw new Error("Not authenticated with Antigravity");
  }

  const models = [...ANTIGRAVITY_KNOWN_MODELS];

  try {
    const accessToken = await getAntigravityAccessToken();
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as any;
      if (data.models && Array.isArray(data.models)) {
        const knownIds = new Set(models.map((m) => m.id));
        for (const m of data.models) {
          const id = m.name?.replace("models/", "") || m.name;
          if (!id || knownIds.has(id)) continue;
          const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
          if (!methods.includes("generateContent")) continue;
          models.push({
            id,
            name: `${m.displayName || id} (Gemini API)`,
            provider: "antigravity",
          });
        }
      }
    }
  } catch {
    // Known models are sufficient if API is unavailable
  }

  return models;
}
