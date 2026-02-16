import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useConfig } from "./ConfigProvider";
import { Combobox } from "./ui/combobox";
import { api } from "@/lib/api";

interface RouterModel {
  value: string;
  label: string;
  provider: string;
  reasoningLevels?: string[];
  defaultReasoningLevel?: string;
}

// Parse current router value to extract model and reasoning level
const parseRouterValue = (value: string) => {
  if (!value) return { model: "", reasoningLevel: "" };
  const parts = value.split(",");
  if (parts.length >= 3) {
    return { model: `${parts[0]},${parts[1]}`, reasoningLevel: parts.slice(2).join(",") };
  }
  return { model: value, reasoningLevel: "" };
};

// Build router value from model + reasoning level
const buildRouterValue = (model: string, reasoningLevel: string) => {
  if (reasoningLevel) return `${model},${reasoningLevel}`;
  return model;
};

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

  // Handle case where config is null or undefined
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

  // Handle case where config.Router is null or undefined
  const routerConfig = config.Router || {
    default: "",
    background: "",
    think: "",
    longContext: "",
    longContextThreshold: 60000,
    webSearch: "",
    image: ""
  };

  const handleRouterChange = (field: string, value: string | number) => {
    const currentRouter = config.Router || {};
    const newRouter = { ...currentRouter, [field]: value };
    setConfig({ ...config, Router: newRouter });
  };

  const handleForceUseImageAgentChange = (value: boolean) => {
    setConfig({ ...config, forceUseImageAgent: value });
  };

  // Get reasoning levels for a model value
  const getReasoningLevels = (modelValue: string): string[] => {
    const found = routerModels.find((m) => m.value === modelValue);
    return found?.reasoningLevels || [];
  };

  // Get default reasoning level for a model value
  const getDefaultReasoningLevel = (modelValue: string): string => {
    const found = routerModels.find((m) => m.value === modelValue);
    return found?.defaultReasoningLevel || "";
  };

  // Handle model selection change for a scenario
  const handleModelSelect = (field: string, value: string) => {
    const rl = getReasoningLevels(value);
    const defaultRL = rl.length ? getDefaultReasoningLevel(value) : "";
    handleRouterChange(field, buildRouterValue(value, defaultRL));
  };

  // Handle reasoning level change for a scenario
  const handleReasoningChange = (field: string, currentValue: string, newReasoningLevel: string) => {
    const { model } = parseRouterValue(currentValue);
    handleRouterChange(field, buildRouterValue(model, newReasoningLevel));
  };

  const routerPresets = useMemo(() => {
    if (routerModels.length === 0) return [];

    const byProvider = new Map<string, RouterModel[]>();
    for (const m of routerModels) {
      const list = byProvider.get(m.provider) || [];
      list.push(m);
      byProvider.set(m.provider, list);
    }

    return Array.from(byProvider.entries()).map(([provider, models]) => {
      const findModel = (keywords: string[]) => {
        for (const kw of keywords) {
          const found = models.find(m => m.label.toLowerCase().includes(kw));
          if (found) {
            const defaultRL = found.defaultReasoningLevel || "";
            return buildRouterValue(found.value, defaultRL);
          }
        }
        const fallback = models[0];
        if (!fallback) return "";
        return buildRouterValue(fallback.value, fallback.defaultReasoningLevel || "");
      };

      return {
        label: provider,
        value: provider,
        default: findModel(["sonnet", "4o", "pro", "2.5"]),
        background: findModel(["haiku", "mini", "flash"]),
        think: findModel(["sonnet", "o3", "pro", "2.5"]),
        longContext: findModel(["sonnet", "4o", "pro", "2.5"]),
        webSearch: findModel(["sonnet", "4o", "pro", "2.5"]),
      };
    });
  }, [routerModels]);

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

  const selectClassName = "h-10 rounded-md border border-input bg-background px-2 py-1 text-sm";

  // Render a reasoning level selector for a scenario field
  const renderReasoningSelect = (field: string, currentValue: string) => {
    const { model, reasoningLevel } = parseRouterValue(currentValue);
    const levels = getReasoningLevels(model);
    if (levels.length === 0) return null;
    return (
      <select
        value={reasoningLevel}
        onChange={(e) => handleReasoningChange(field, currentValue, e.target.value)}
        className={selectClassName}
      >
        <option value="">{t("router.reasoningAuto")}</option>
        {levels.map((level) => (
          <option key={level} value={level}>{level}</option>
        ))}
      </select>
    );
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="border-b p-4">
        <CardTitle className="text-lg">{t("router.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-5 overflow-y-auto p-4">
        {routerPresets.length > 0 && (
          <div className="space-y-2">
            <Label>{t("router.preset")}</Label>
            <Combobox
              options={routerPresets.map(p => ({ label: p.label, value: p.value }))}
              value=""
              onChange={(value) => {
                const preset = routerPresets.find(p => p.value === value);
                if (preset) {
                  const newRouter = {
                    ...routerConfig,
                    default: preset.default,
                    background: preset.background,
                    think: preset.think,
                    longContext: preset.longContext,
                    webSearch: preset.webSearch,
                  };
                  setConfig({ ...config, Router: newRouter });
                }
              }}
              placeholder={t("router.selectPreset")}
              emptyPlaceholder={t("router.noPresetFound")}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>{t("router.default")}</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={modelOptions}
                value={parseRouterValue(routerConfig.default || "").model}
                onChange={(value) => handleModelSelect("default", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            {renderReasoningSelect("default", routerConfig.default || "")}
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("router.background")}</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={modelOptions}
                value={parseRouterValue(routerConfig.background || "").model}
                onChange={(value) => handleModelSelect("background", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            {renderReasoningSelect("background", routerConfig.background || "")}
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("router.think")}</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={modelOptions}
                value={parseRouterValue(routerConfig.think || "").model}
                onChange={(value) => handleModelSelect("think", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            {renderReasoningSelect("think", routerConfig.think || "")}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{t("router.longContext")}</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Combobox
                    options={modelOptions}
                    value={parseRouterValue(routerConfig.longContext || "").model}
                    onChange={(value) => handleModelSelect("longContext", value)}
                    placeholder={t("router.selectModel")}
                    searchPlaceholder={t("router.searchModel")}
                    emptyPlaceholder={t("router.noModelFound")}
                  />
                </div>
                {renderReasoningSelect("longContext", routerConfig.longContext || "")}
              </div>
            </div>
            <div className="w-48">
              <Label>{t("router.longContextThreshold")}</Label>
              <Input
                type="number"
                value={routerConfig.longContextThreshold || 60000}
                onChange={(e) => handleRouterChange("longContextThreshold", parseInt(e.target.value) || 60000)}
                placeholder="60000"
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("router.webSearch")}</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={modelOptions}
                value={parseRouterValue(routerConfig.webSearch || "").model}
                onChange={(value) => handleModelSelect("webSearch", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            {renderReasoningSelect("webSearch", routerConfig.webSearch || "")}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{t("router.image")} (beta)</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Combobox
                    options={modelOptions}
                    value={parseRouterValue(routerConfig.image || "").model}
                    onChange={(value) => handleModelSelect("image", value)}
                    placeholder={t("router.selectModel")}
                    searchPlaceholder={t("router.searchModel")}
                    emptyPlaceholder={t("router.noModelFound")}
                  />
                </div>
                {renderReasoningSelect("image", routerConfig.image || "")}
              </div>
            </div>
            <div className="w-48">
              <Label htmlFor="forceUseImageAgent">{t("router.forceUseImageAgent")}</Label>
              <select
                id="forceUseImageAgent"
                value={config.forceUseImageAgent ? "true" : "false"}
                onChange={(e) => handleForceUseImageAgentChange(e.target.value === "true")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="false">{t("common.no")}</option>
                <option value="true">{t("common.yes")}</option>
              </select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
