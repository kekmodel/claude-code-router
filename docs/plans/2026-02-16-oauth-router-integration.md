# OAuth Model → Router Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable OAuth provider models (with reasoning levels) to appear in Router UI dropdowns and pass reasoning level config to upstream providers.

**Architecture:** The Router UI currently builds model options only from `config.Providers[].models`. We add an API endpoint that merges static config models with dynamic OAuth models. The UI Router component fetches this merged list. Reasoning level is stored in Router config as `"provider,model,reasoningLevel"` triple format and extracted at request time.

**Tech Stack:** TypeScript, React, Fastify, existing transformer pipeline

---

### Task 1: Server API — Merged model list endpoint

**Files:**
- Modify: `packages/server/src/server.ts` (add new `/api/router/models` endpoint)

**Step 1: Add the endpoint**

After the existing `/api/config` endpoint (~line 98), add:

```typescript
// Get all available models for router configuration (static + OAuth)
app.get("/api/router/models", async (req: any, reply: any) => {
  // 1. Static models from config Providers
  const config = await readConfigFile();
  const providers = Array.isArray(config.Providers) ? config.Providers : [];
  const models: Array<{
    value: string;
    label: string;
    provider: string;
    reasoningLevels?: string[];
    defaultReasoningLevel?: string;
  }> = [];

  for (const p of providers) {
    if (!p?.name || !Array.isArray(p.models)) continue;
    for (const model of p.models) {
      models.push({
        value: `${p.name},${model}`,
        label: `${p.name}, ${model}`,
        provider: p.name,
      });
    }
  }

  // 2. OAuth models (from authenticated providers)
  for (const p of providers) {
    if (p?.auth_type !== "oauth" || !p?.oauth_provider) continue;
    try {
      const oauthModels = await fetchOAuthModels(p.oauth_provider);
      const existingValues = new Set(models.map((m) => m.value));
      for (const om of oauthModels) {
        const value = `${p.name},${om.id}`;
        if (!existingValues.has(value)) {
          models.push({
            value,
            label: `${p.name}, ${om.name || om.id}`,
            provider: p.name,
            reasoningLevels: om.reasoningLevels,
            defaultReasoningLevel: om.defaultReasoningLevel,
          });
          existingValues.add(value);
        }
      }
    } catch {
      // OAuth not authenticated or fetch failed — skip
    }
  }

  return { models };
});
```

**Step 2: Build and verify**

Run: `pnpm build:shared && rm -rf packages/server/dist packages/cli/dist && pnpm build:server && pnpm build:cli`

Run: `node packages/cli/dist/cli.js restart`

Run: `curl -s http://127.0.0.1:3456/api/router/models | python3 -m json.tool | head -30`

Expected: JSON with `models` array containing both static and OAuth models

**Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat: add /api/router/models endpoint merging static + OAuth models"
```

---

### Task 2: UI API client — Add router models fetch

**Files:**
- Modify: `packages/ui/src/lib/api.ts`

**Step 1: Add the API method**

After the `fetchAuthModels` method, add:

```typescript
// Fetch all available models for router configuration (static + OAuth)
async fetchRouterModels(): Promise<{
  models: Array<{
    value: string;
    label: string;
    provider: string;
    reasoningLevels?: string[];
    defaultReasoningLevel?: string;
  }>;
}> {
  return this.get<{
    models: Array<{
      value: string;
      label: string;
      provider: string;
      reasoningLevels?: string[];
      defaultReasoningLevel?: string;
    }>;
  }>("/router/models");
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/lib/api.ts
git commit -m "feat: add fetchRouterModels API method"
```

---

### Task 3: UI Router component — Use merged model list with reasoning level

**Files:**
- Modify: `packages/ui/src/components/Router.tsx`

**Step 1: Replace static modelOptions with dynamic fetch**

Replace the entire Router component with:

```tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useConfig } from "./ConfigProvider";
import { Combobox } from "./ui/combobox";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

interface RouterModel {
  value: string;
  label: string;
  provider: string;
  reasoningLevels?: string[];
  defaultReasoningLevel?: string;
}

export function Router() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [routerModels, setRouterModels] = useState<RouterModel[]>([]);

  useEffect(() => {
    api.fetchRouterModels()
      .then((res) => setRouterModels(res.models || []))
      .catch(() => {
        // Fallback to static config models
      });
  }, [config?.Providers]);

  if (!config) {
    return (
      <Card className="flex h-full flex-col rounded-lg border shadow-sm">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-lg">{t("router.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <div className="text-gray-500">Loading router configuration...</div>
        </CardContent>
      </Card>
    );
  }

  const routerConfig = config.Router || {
    default: "",
    background: "",
    think: "",
    longContext: "",
    longContextThreshold: 60000,
    webSearch: "",
    image: "",
  };

  const handleRouterChange = (field: string, value: string | number) => {
    const currentRouter = config.Router || {};
    const newRouter = { ...currentRouter, [field]: value };
    setConfig({ ...config, Router: newRouter });
  };

  const handleForceUseImageAgentChange = (value: boolean) => {
    setConfig({ ...config, forceUseImageAgent: value });
  };

  // Fallback: use static config models if API fetch hasn't returned
  const providers = Array.isArray(config.Providers) ? config.Providers : [];
  const fallbackOptions = providers.flatMap((provider) => {
    if (!provider) return [];
    const models = Array.isArray(provider.models) ? provider.models : [];
    const providerName = provider.name || "Unknown Provider";
    return models.map((model: string) => ({
      value: `${providerName},${model || "Unknown Model"}`,
      label: `${providerName}, ${model || "Unknown Model"}`,
    }));
  });

  const modelOptions = routerModels.length > 0
    ? routerModels.map((m) => {
        const suffix = m.reasoningLevels?.length
          ? ` [${m.reasoningLevels.join("/")}]`
          : "";
        return { value: m.value, label: m.label + suffix };
      })
    : fallbackOptions;

  // ... rest of JSX unchanged (same Combobox usage)
```

The Combobox options now include reasoning level hints in the label. The existing JSX remains the same.

**Step 2: Build UI**

Run: `pnpm build:ui`

**Step 3: Commit**

```bash
git add packages/ui/src/components/Router.tsx
git commit -m "feat: Router UI uses merged model list with reasoning level display"
```

---

### Task 4: Router config format — Support reasoning level in model string

**Files:**
- Modify: `packages/core/src/utils/router.ts` (extract reasoning level from model string)
- Modify: `packages/core/src/api/routes.ts` (pass reasoning level to request)

**Step 1: Update router to parse reasoning level**

In `router.ts`, update the return type and model parsing. The format is `"provider,model"` or `"provider,model,reasoningLevel"`.

In `getUseModel`, update return:

```typescript
export interface RouterResult {
  model: string;
  scenarioType: RouterScenarioType;
  reasoningLevel?: string;
}
```

Update all return statements to extract reasoningLevel:

```typescript
// Helper to parse "provider,model,reasoningLevel" format
function parseRouterModel(modelStr: string): { model: string; reasoningLevel?: string } {
  if (!modelStr) return { model: modelStr };
  const parts = modelStr.split(",");
  if (parts.length >= 3) {
    return {
      model: `${parts[0]},${parts[1]}`,
      reasoningLevel: parts[2],
    };
  }
  return { model: modelStr };
}
```

Then in `getUseModel`, wrap each return:

```typescript
// Example for Router.default:
const parsed = parseRouterModel(Router?.default);
return { model: parsed.model, scenarioType: 'default', reasoningLevel: parsed.reasoningLevel };
```

Apply similar pattern to all scenario returns (longContext, background, think, webSearch).

**Step 2: Pass reasoning level to request body in router()**

In the `router()` function, after `req.body.model = model`, add:

```typescript
const result = await getUseModel(req, tokenCount, configService, lastMessageUsage);
model = result.model;
req.scenarioType = result.scenarioType;
if (result.reasoningLevel) {
  req.routerReasoningLevel = result.reasoningLevel;
}
```

**Step 3: In routes.ts, inject reasoning level before sending to provider**

In `packages/core/src/api/routes.ts`, in the request processing (before `sendRequestToProvider`), check for `req.routerReasoningLevel` and inject it:

```typescript
// After transformer processing, before sendRequestToProvider
if (req.routerReasoningLevel && !requestBody.reasoning?.effort) {
  requestBody.reasoning = {
    ...requestBody.reasoning,
    effort: req.routerReasoningLevel,
  };
}
```

This only injects if the client didn't already set a reasoning level (client takes precedence).

**Step 4: Build and test**

Run: `pnpm build:shared && rm -rf packages/server/dist packages/cli/dist && pnpm build:server && pnpm build:cli`

Run: `node packages/cli/dist/cli.js restart`

Test with a config like:
```json
{
  "Router": {
    "default": "codex,gpt-5.2-codex,high"
  }
}
```

**Step 5: Commit**

```bash
git add packages/core/src/utils/router.ts packages/core/src/api/routes.ts
git commit -m "feat: support reasoning level in router model config format"
```

---

### Task 5: UI Router — Reasoning level selector per scenario

**Files:**
- Modify: `packages/ui/src/components/Router.tsx` (add reasoning level dropdown next to model selector)
- Modify: `packages/ui/src/locales/en.json` (add translation keys)
- Modify: `packages/ui/src/locales/zh.json` (add translation keys)

**Step 1: Add translation keys**

In `en.json`, add to `router` section:

```json
"reasoningLevel": "Reasoning Level",
"reasoningNone": "None",
"reasoningAuto": "Auto (provider default)"
```

In `zh.json`:

```json
"reasoningLevel": "推理等级",
"reasoningNone": "无",
"reasoningAuto": "自动（供应商默认）"
```

**Step 2: Update Router component**

For each scenario (default, think, background, etc.), when a model is selected:
1. Look up the selected model in `routerModels` to get its `reasoningLevels`
2. If the model has reasoning levels, show a small dropdown to select one
3. Store in config as `"provider,model,reasoningLevel"` triple

Add helper to the Router component:

```tsx
// Parse current router value to extract model and reasoning level
const parseRouterValue = (value: string) => {
  if (!value) return { model: "", reasoningLevel: "" };
  const parts = value.split(",");
  if (parts.length >= 3) {
    return { model: `${parts[0]},${parts[1]}`, reasoningLevel: parts[2] };
  }
  return { model: value, reasoningLevel: "" };
};

// Build router value from model + reasoning level
const buildRouterValue = (model: string, reasoningLevel: string) => {
  if (reasoningLevel) return `${model},${reasoningLevel}`;
  return model;
};

// Get reasoning levels for a model value
const getReasoningLevels = (modelValue: string): string[] => {
  const found = routerModels.find((m) => m.value === modelValue);
  return found?.reasoningLevels || [];
};
```

For each scenario, create a paired component:

```tsx
<div className="space-y-2">
  <Label>{t("router.default")}</Label>
  <div className="flex items-center gap-2">
    <div className="flex-1">
      <Combobox
        options={modelOptions}
        value={parseRouterValue(routerConfig.default || "").model}
        onChange={(value) => {
          const rl = getReasoningLevels(value);
          const defaultRL = routerModels.find(m => m.value === value)?.defaultReasoningLevel || "";
          handleRouterChange("default", buildRouterValue(value, rl.length ? defaultRL : ""));
        }}
        placeholder={t("router.selectModel")}
        searchPlaceholder={t("router.searchModel")}
        emptyPlaceholder={t("router.noModelFound")}
      />
    </div>
    {getReasoningLevels(parseRouterValue(routerConfig.default || "").model).length > 0 && (
      <select
        value={parseRouterValue(routerConfig.default || "").reasoningLevel}
        onChange={(e) => {
          const model = parseRouterValue(routerConfig.default || "").model;
          handleRouterChange("default", buildRouterValue(model, e.target.value));
        }}
        className="h-10 rounded-md border border-input bg-background px-2 py-1 text-sm"
      >
        <option value="">{t("router.reasoningAuto")}</option>
        {getReasoningLevels(parseRouterValue(routerConfig.default || "").model).map(
          (level) => (
            <option key={level} value={level}>{level}</option>
          )
        )}
      </select>
    )}
  </div>
</div>
```

Apply this pattern to all scenarios: default, background, think, longContext, webSearch, image.

**Step 3: Build UI and full stack**

Run: `pnpm build:ui && pnpm build:shared && rm -rf packages/server/dist packages/cli/dist && pnpm build:server && pnpm build:cli`

Run: `node packages/cli/dist/cli.js restart`

**Step 4: Commit**

```bash
git add packages/ui/src/components/Router.tsx packages/ui/src/locales/en.json packages/ui/src/locales/zh.json
git commit -m "feat: add reasoning level selector to Router UI per scenario"
```

---

### Task 6: Auto-register OAuth models into provider

**Files:**
- Modify: `packages/server/src/server.ts` (auto-sync OAuth models to provider's models array at startup)

**Step 1: Add model auto-sync after OAuth wiring**

In `packages/server/src/server.ts`, in the `createServer` function, after OAuth auth endpoints, add a function to auto-register OAuth models into providers:

```typescript
// Auto-sync: Register OAuth-discovered models into provider model routes
app.get("/api/oauth/sync-models/:provider", async (req: any, reply: any) => {
  const providerName = (req.params as any).provider;
  const config = await readConfigFile();
  const providers = Array.isArray(config.Providers) ? config.Providers : [];
  const providerConfig = providers.find(
    (p: any) => p?.name === providerName && p?.auth_type === "oauth"
  );

  if (!providerConfig) {
    return reply.status(404).send({ error: `OAuth provider '${providerName}' not found` });
  }

  try {
    const oauthModels = await fetchOAuthModels(providerConfig.oauth_provider);
    const existingModels = new Set(providerConfig.models || []);
    let added = 0;

    for (const om of oauthModels) {
      if (!existingModels.has(om.id)) {
        providerConfig.models = providerConfig.models || [];
        providerConfig.models.push(om.id);
        added++;
      }
    }

    if (added > 0) {
      await writeConfigFile(config);
    }

    return {
      provider: providerName,
      totalModels: providerConfig.models.length,
      added,
      models: providerConfig.models,
    };
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
});
```

**Step 2: Build and test**

Run: `pnpm build:shared && rm -rf packages/server/dist packages/cli/dist && pnpm build:server && pnpm build:cli`

Run: `node packages/cli/dist/cli.js restart`

Run: `curl -s http://127.0.0.1:3456/api/oauth/sync-models/codex | python3 -m json.tool`

**Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat: add OAuth model sync endpoint to auto-register models"
```

---

## Verification

After all tasks are complete:

1. `pnpm build` — Full monorepo build succeeds
2. `node packages/cli/dist/cli.js restart` — Service starts
3. `curl http://127.0.0.1:3456/api/router/models` — Returns merged model list with reasoning levels
4. Open UI at `http://127.0.0.1:3456/ui/` → Router page shows OAuth models in dropdowns
5. Select a Codex model → Reasoning level dropdown appears with options (low/medium/high/xhigh)
6. Save config → Check config.json has `"default": "codex,gpt-5.2-codex,high"` format
7. Send a request through CCR → Verify `reasoning.effort` is injected in upstream request
