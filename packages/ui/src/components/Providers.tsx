import { useState, useRef, useEffect, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useConfig } from "./ConfigProvider";
import { ProviderList } from "./ProviderList";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, Trash2, Plus, Eye, EyeOff, Search, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ComboInput, type ComboInputRef } from "@/components/ui/combo-input";
import { api } from "@/lib/api";
import type { Provider } from "@/types";

const OAUTH_PROVIDER_TEMPLATES: Provider[] = [
  {
    name: "copilot",
    api_base_url: "https://api.githubcopilot.com/chat/completions",
    api_key: "",
    models: [],
    auth_type: "oauth",
    oauth_provider: "copilot",
    transformer: { use: ["OpenAI"] },
  },
  {
    name: "codex",
    api_base_url: "https://chatgpt.com/backend-api/codex/responses",
    api_key: "",
    models: [],
    auth_type: "oauth",
    oauth_provider: "codex",
    transformer: { use: ["openai-responses"] },
  },
  {
    name: "gemini",
    api_base_url: "https://generativelanguage.googleapis.com",
    api_key: "",
    models: [],
    auth_type: "oauth",
    oauth_provider: "gemini",
    transformer: { use: ["gemini"] },
  },
  {
    name: "antigravity",
    api_base_url: "https://daily-cloudcode-pa.sandbox.googleapis.com",
    api_key: "",
    models: [],
    auth_type: "oauth",
    oauth_provider: "antigravity",
    transformer: { use: ["gemini"] },
  },
];

type ParamInput = { name: string; value: string };
type ParamInputMap = Record<string, ParamInput>;
const EMPTY_PARAM_INPUT: ParamInput = { name: "", value: "" };

export function Providers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config, setConfig } = useConfig();
  const [editingProviderIndex, setEditingProviderIndex] = useState<number | null>(null);
  const [deletingProviderIndex, setDeletingProviderIndex] = useState<number | null>(null);
  const [hasFetchedModels, setHasFetchedModels] = useState<Record<number, boolean>>({});
  const [providerParamInputs, setProviderParamInputs] = useState<ParamInputMap>({});
  const [modelParamInputs, setModelParamInputs] = useState<ParamInputMap>({});
  const [availableTransformers, setAvailableTransformers] = useState<{name: string; endpoint: string | null;}[]>([]);
  const [editingProviderData, setEditingProviderData] = useState<Provider | null>(null);
  const [isNewProvider, setIsNewProvider] = useState<boolean>(false);
  const [providerTemplates, setProviderTemplates] = useState<Provider[]>([]);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const comboInputRef = useRef<ComboInputRef>(null);

  useEffect(() => {
    const fetchProviderTemplates = async () => {
      try {
        const response = await fetch('https://pub-0dc3e1677e894f07bbea11b17a29e032.r2.dev/providers.json');
        if (response.ok) {
          const data = await response.json();
          setProviderTemplates(data || []);
        } else {
          console.error('Failed to fetch provider templates');
        }
      } catch (error) {
        console.error('Failed to fetch provider templates:', error);
      }
    };

    fetchProviderTemplates();
  }, []);

  // Fetch available transformers when component mounts
  useEffect(() => {
    const fetchTransformers = async () => {
      try {
        const response = await api.get<{transformers: {name: string; endpoint: string | null;}[]}>('/transformers');
        setAvailableTransformers(response.transformers);
      } catch (error) {
        console.error('Failed to fetch transformers:', error);
      }
    };

    fetchTransformers();
  }, []);

  // Handle case where config is null or undefined
  if (!config) {
    return (
      <Card className="flex h-full flex-col rounded-lg border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b p-4">
          <CardTitle className="text-lg">{t("providers.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <div className="text-gray-500">Loading providers configuration...</div>
        </CardContent>
      </Card>
    );
  }

  // Validate config.Providers to ensure it's an array
  const validProviders = Array.isArray(config.Providers) ? config.Providers : [];

  const cloneProviderData = (provider: Provider): Provider => (
    JSON.parse(JSON.stringify(provider)) as Provider
  );

  const updateEditingProviderData = (updater: (provider: Provider) => void) => {
    setEditingProviderData((prev) => {
      if (!prev) return prev;
      const next = cloneProviderData(prev);
      updater(next);
      return next;
    });
  };

  const clearEditorValidation = () => {
    setApiKeyError(null);
    setNameError(null);
  };

  const setProviderApiKeyVisibility = (index: number | null, visible: boolean) => {
    if (index === null) return;
    setShowApiKey(prev => ({
      ...prev,
      [index]: visible,
    }));
  };

  const clearProviderUiState = (index: number | null, clearFetchedModels: boolean) => {
    if (index !== null) {
      if (clearFetchedModels) {
        setHasFetchedModels(prev => {
          const newState = { ...prev };
          delete newState[index];
          return newState;
        });
      }
      setShowApiKey(prev => {
        const newState = { ...prev };
        delete newState[index];
        return newState;
      });
    }
    clearEditorValidation();
  };

  const openProviderEditor = (index: number, provider: Provider, isNew: boolean) => {
    setEditingProviderIndex(index);
    setEditingProviderData(cloneProviderData(provider));
    setIsNewProvider(isNew);
    setProviderApiKeyVisibility(index, false);
    clearEditorValidation();
  };

  const closeProviderEditor = (index: number | null, clearFetchedModels: boolean) => {
    clearProviderUiState(index, clearFetchedModels);
    setEditingProviderIndex(null);
    setEditingProviderData(null);
    setIsNewProvider(false);
  };

  const handleAddProvider = () => {
    const newProvider: Provider = { name: "", api_base_url: "", api_key: "", models: [] };
    openProviderEditor(validProviders.length, newProvider, true);
  };

  const handleEditProvider = (index: number) => {
    // Find the actual index in the original providers array
    const actualIndex = validProviders.indexOf(filteredProviders[index]);
    const provider = config.Providers[actualIndex];
    openProviderEditor(actualIndex, provider, false);
  };

  const handleSaveProvider = () => {
    if (!editingProviderData) return;
    
    // Validate name
    if (!editingProviderData.name || editingProviderData.name.trim() === '') {
      setNameError(t("providers.name_required"));
      return;
    }
    
    // Check for duplicate names (case-insensitive)
    const trimmedName = editingProviderData.name.trim();
    const isDuplicate = config.Providers.some((provider, index) => {
      // For edit mode, skip checking the current provider being edited
      if (!isNewProvider && index === editingProviderIndex) {
        return false;
      }
      return provider.name.toLowerCase() === trimmedName.toLowerCase();
    });
    
    if (isDuplicate) {
      setNameError(t("providers.name_duplicate"));
      return;
    }
    
    // Skip API key validation for OAuth providers
    if (editingProviderData.auth_type !== "oauth") {
      if (!editingProviderData.api_key || editingProviderData.api_key.trim() === '') {
        setApiKeyError(t("providers.api_key_required"));
        return;
      }
    }
    
    // Clear errors if validation passes
    clearEditorValidation();
    
    if (editingProviderIndex !== null && editingProviderData) {
      const providerToSave = cloneProviderData(editingProviderData);
      const newProviders = [...config.Providers];
      if (isNewProvider) {
        newProviders.push(providerToSave);
      } else {
        newProviders[editingProviderIndex] = providerToSave;
      }
      setConfig({ ...config, Providers: newProviders });
    }
    closeProviderEditor(editingProviderIndex, false);
  };

  const handleCancelAddProvider = () => {
    closeProviderEditor(editingProviderIndex, true);
  };

  // Handle deletion by setting the correct index in the state
  const handleSetDeletingProviderIndex = (filteredIndex: number) => {
    setDeletingProviderIndex(filteredIndex);
  };

  // Handle deletion by passing the filtered index to get the actual index in the original array
  const handleRemoveProvider = (filteredIndex: number) => {
    // Find the actual index in the original providers array
    const actualIndex = validProviders.indexOf(filteredProviders[filteredIndex]);
    const newProviders = [...config.Providers];
    newProviders.splice(actualIndex, 1);
    setConfig({ ...config, Providers: newProviders });
    setDeletingProviderIndex(null);
  };

  const handleProviderChange = (_index: number, field: string, value: string) => {
    updateEditingProviderData((provider) => {
      (provider as any)[field] = value;
    });
  };

  type TransformerParams = Record<string, unknown>;
  type TransformerEntry = string | (string | TransformerParams | { max_tokens: number })[];
  const getProviderParamKey = (providerIndex: number, transformerIndex: number) =>
    `provider-${providerIndex}-transformer-${transformerIndex}`;
  const getModelParamKey = (providerIndex: number, model: string, transformerIndex: number) =>
    `model-${providerIndex}-${model}-transformer-${transformerIndex}`;

  const getParamInput = (inputs: ParamInputMap, key: string): ParamInput => (
    inputs[key] || EMPTY_PARAM_INPUT
  );

  const setParamInputField = (
    setInputs: Dispatch<SetStateAction<ParamInputMap>>,
    key: string,
    field: keyof ParamInput,
    value: string
  ) => {
    setInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || EMPTY_PARAM_INPUT),
        [field]: value,
      },
    }));
  };

  const clearParamInput = (
    setInputs: Dispatch<SetStateAction<ParamInputMap>>,
    key: string
  ) => {
    setInputs((prev) => ({
      ...prev,
      [key]: EMPTY_PARAM_INPUT,
    }));
  };

  const renderTransformerParameterEditor = ({
    transformer,
    inputKey,
    paramInputs,
    setParamInputs,
    onAddParameter,
    onRemoveParameter,
  }: {
    transformer: TransformerEntry;
    inputKey: string;
    paramInputs: ParamInputMap;
    setParamInputs: Dispatch<SetStateAction<ParamInputMap>>;
    onAddParameter: (paramName: string, paramValue: string) => void;
    onRemoveParameter: (paramName: string) => void;
  }) => {
    const paramInput = getParamInput(paramInputs, inputKey);
    const params = getTransformerParams(transformer);
    return (
      <div className="mt-2 pl-4 border-l-2 border-gray-200">
        <Label className="text-sm">{t("providers.transformer_parameters")}</Label>
        <div className="space-y-2 mt-1">
          <div className="flex gap-2">
            <Input
              placeholder={t("providers.parameter_name")}
              value={paramInput.name}
              onChange={(e) => {
                setParamInputField(
                  setParamInputs,
                  inputKey,
                  "name",
                  e.target.value
                );
              }}
            />
            <Input
              placeholder={t("providers.parameter_value")}
              value={paramInput.value}
              onChange={(e) => {
                setParamInputField(
                  setParamInputs,
                  inputKey,
                  "value",
                  e.target.value
                );
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!paramInput.name || !paramInput.value) return;
                onAddParameter(paramInput.name, paramInput.value);
                clearParamInput(setParamInputs, inputKey);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {Object.keys(params).length > 0 && (
            <div className="space-y-1">
              {Object.entries(params).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between bg-gray-50 rounded p-2">
                  <div className="text-sm">
                    <span className="font-medium">{key}:</span> {String(value)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onRemoveParameter(key)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTransformerCard = ({
    cardKey,
    transformer,
    onRemove,
    parameterEditor,
  }: {
    cardKey: string;
    transformer: TransformerEntry;
    onRemove: () => void;
    parameterEditor: ReactNode;
  }) => (
    <div key={cardKey} className="border rounded-md p-3">
      <div className="flex gap-2 items-center mb-2">
        <div className="flex-1 bg-gray-50 rounded p-2 text-sm">
          {getTransformerLabel(transformer)}
        </div>
        <Button variant="outline" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {parameterEditor}
    </div>
  );

  const renderSelectedTransformers = ({
    transformers,
    getCardKey,
    getInputKey,
    paramInputs,
    setParamInputs,
    onRemoveTransformer,
    onAddParameter,
    onRemoveParameter,
  }: {
    transformers?: TransformerEntry[];
    getCardKey: (transformerIndex: number) => string;
    getInputKey: (transformerIndex: number) => string;
    paramInputs: ParamInputMap;
    setParamInputs: Dispatch<SetStateAction<ParamInputMap>>;
    onRemoveTransformer: (transformerIndex: number) => void;
    onAddParameter: (
      transformerIndex: number,
      paramName: string,
      paramValue: string
    ) => void;
    onRemoveParameter: (transformerIndex: number, paramName: string) => void;
  }) => {
    if (!transformers || transformers.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2 mt-2">
        <div className="text-sm font-medium text-gray-700">{t("providers.selected_transformers")}</div>
        {transformers.map((transformer, transformerIndex) =>
          renderTransformerCard({
            cardKey: getCardKey(transformerIndex),
            transformer,
            onRemove: () => onRemoveTransformer(transformerIndex),
            parameterEditor: renderTransformerParameterEditor({
              transformer,
              inputKey: getInputKey(transformerIndex),
              paramInputs,
              setParamInputs,
              onAddParameter: (paramName, paramValue) =>
                onAddParameter(transformerIndex, paramName, paramValue),
              onRemoveParameter: (paramName) =>
                onRemoveParameter(transformerIndex, paramName),
            }),
          })
        )}
      </div>
    );
  };

  const ensureTransformerRoot = (provider: Provider) => {
    if (!provider.transformer) {
      provider.transformer = { use: [] };
    }
    if (!Array.isArray(provider.transformer.use)) {
      provider.transformer.use = [];
    }
    return provider.transformer;
  };

  const ensureTransformerUse = (
    provider: Provider,
    model?: string
  ): TransformerEntry[] => {
    const transformerRoot = ensureTransformerRoot(provider) as any;
    if (!model) {
      return transformerRoot.use as TransformerEntry[];
    }
    if (!transformerRoot[model]) {
      transformerRoot[model] = { use: [] };
    }
    if (!Array.isArray(transformerRoot[model].use)) {
      transformerRoot[model].use = [];
    }
    return transformerRoot[model].use as TransformerEntry[];
  };

  const getTransformerUse = (
    provider: Provider,
    model?: string
  ): TransformerEntry[] | undefined => {
    if (!provider.transformer) return undefined;
    if (!model) return provider.transformer.use as TransformerEntry[];
    return (provider.transformer as any)[model]?.use as TransformerEntry[] | undefined;
  };

  const getTransformerLabel = (transformer: TransformerEntry): string => {
    if (typeof transformer === "string") return transformer;
    if (Array.isArray(transformer)) return String(transformer[0]);
    return String(transformer);
  };

  const getTransformerParams = (transformer: TransformerEntry): TransformerParams => {
    if (!Array.isArray(transformer) || transformer.length <= 1) {
      return {};
    }
    const paramsCandidate = transformer[1];
    if (
      typeof paramsCandidate !== "object" ||
      paramsCandidate === null ||
      Array.isArray(paramsCandidate)
    ) {
      return {};
    }
    return paramsCandidate as TransformerParams;
  };

  const addTransformerParameterToEntry = (
    transformer: TransformerEntry,
    paramName: string,
    paramValue: string
  ): TransformerEntry => {
    if (!Array.isArray(transformer)) {
      return [transformer, { [paramName]: paramValue }];
    }
    const updatedTransformer = [...transformer];
    const existingParams = getTransformerParams(updatedTransformer as TransformerEntry);
    const nextParams = { ...existingParams, [paramName]: paramValue };

    if (updatedTransformer.length > 1) {
      updatedTransformer.splice(1, updatedTransformer.length - 1, nextParams);
    } else {
      updatedTransformer.push(nextParams);
    }
    return updatedTransformer as TransformerEntry;
  };

  const removeTransformerParameterFromEntry = (
    transformer: TransformerEntry,
    paramName: string
  ): TransformerEntry => {
    if (!Array.isArray(transformer) || transformer.length <= 1) {
      return transformer;
    }
    const updatedTransformer = [...transformer];
    const nextParams = { ...getTransformerParams(updatedTransformer as TransformerEntry) };
    delete nextParams[paramName];

    if (Object.keys(nextParams).length === 0) {
      updatedTransformer.splice(1, 1);
    } else {
      updatedTransformer.splice(1, updatedTransformer.length - 1, nextParams);
    }

    return updatedTransformer as TransformerEntry;
  };

  const addTransformer = (transformerPath: string, model?: string) => {
    if (!transformerPath) return;
    updateEditingProviderData((provider) => {
      const use = ensureTransformerUse(provider, model);
      use.push(transformerPath);
    });
  };

  const removeTransformer = (transformerIndex: number, model?: string) => {
    updateEditingProviderData((provider) => {
      const use = getTransformerUse(provider, model);
      if (!Array.isArray(use)) return;

      use.splice(transformerIndex, 1);

      if (model) {
        const modelTransformer = (provider.transformer as any)?.[model];
        if (
          modelTransformer &&
          Array.isArray(modelTransformer.use) &&
          modelTransformer.use.length === 0 &&
          Object.keys(modelTransformer).length === 1
        ) {
          delete (provider.transformer as any)[model];
        }
      } else if (
        provider.transformer &&
        Array.isArray(provider.transformer.use) &&
        provider.transformer.use.length === 0 &&
        Object.keys(provider.transformer).length === 1
      ) {
        delete provider.transformer;
      }
    });
  };

  const updateTransformerParameter = (
    transformerIndex: number,
    paramName: string,
    paramValue: string,
    model?: string
  ) => {
    updateEditingProviderData((provider) => {
      const use = getTransformerUse(provider, model);
      if (!Array.isArray(use) || use.length <= transformerIndex) {
        return;
      }

      use[transformerIndex] = addTransformerParameterToEntry(
        use[transformerIndex],
        paramName,
        paramValue
      );
    });
  };

  const removeTransformerParameter = (
    transformerIndex: number,
    paramName: string,
    model?: string
  ) => {
    updateEditingProviderData((provider) => {
      const use = getTransformerUse(provider, model);
      if (!Array.isArray(use) || use.length <= transformerIndex) {
        return;
      }

      use[transformerIndex] = removeTransformerParameterFromEntry(
        use[transformerIndex],
        paramName
      );
    });
  };

  const handleProviderTransformerChange = (_index: number, transformerPath: string) => {
    addTransformer(transformerPath);
  };

  const removeProviderTransformerAtIndex = (_index: number, transformerIndex: number) => {
    removeTransformer(transformerIndex);
  };

  const handleModelTransformerChange = (_providerIndex: number, model: string, transformerPath: string) => {
    addTransformer(transformerPath, model);
  };

  const removeModelTransformerAtIndex = (_providerIndex: number, model: string, transformerIndex: number) => {
    removeTransformer(transformerIndex, model);
  };


  const addProviderTransformerParameter = (_providerIndex: number, transformerIndex: number, paramName: string, paramValue: string) => {
    updateTransformerParameter(transformerIndex, paramName, paramValue);
  };


  const removeProviderTransformerParameterAtIndex = (_providerIndex: number, transformerIndex: number, paramName: string) => {
    removeTransformerParameter(transformerIndex, paramName);
  };

  const addModelTransformerParameter = (_providerIndex: number, model: string, transformerIndex: number, paramName: string, paramValue: string) => {
    updateTransformerParameter(transformerIndex, paramName, paramValue, model);
  };


  const removeModelTransformerParameterAtIndex = (_providerIndex: number, model: string, transformerIndex: number, paramName: string) => {
    removeTransformerParameter(transformerIndex, paramName, model);
  };

  const handleAddModel = (_index: number, model: string) => {
    const normalizedModel = model.trim();
    if (!normalizedModel) return;

    updateEditingProviderData((provider) => {
      const models = Array.isArray(provider.models) ? [...provider.models] : [];
      if (models.includes(normalizedModel)) return;
      models.push(normalizedModel);
      provider.models = models;
    });
  };

  const handleTemplateImport = (value: string) => {
    if (!value) return;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || !parsed.name || !parsed.api_base_url) {
        console.error("Invalid template: missing required fields (name, api_base_url)");
        return;
      }
      const selectedTemplate = parsed as Provider;
      if (selectedTemplate) {
        const currentName = editingProviderData?.name;
        const newProviderData = cloneProviderData(selectedTemplate);

        if (!isNewProvider && currentName) {
          newProviderData.name = currentName;
        }

        setEditingProviderData(newProviderData as Provider);

        // Auto-fetch models for OAuth providers
        if (newProviderData.auth_type === "oauth" && newProviderData.oauth_provider) {
          api.fetchAuthModels(newProviderData.oauth_provider).then((result) => {
            if (result.models && result.models.length > 0) {
              const modelIds = result.models.map((m) => m.id);
              setEditingProviderData((prev) => {
                if (!prev) return prev;
                return { ...prev, models: modelIds };
              });
            }
          }).catch(() => {
            // Not authenticated yet — models stay empty, user can add manually
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse template", e);
    }
  };

  const handleRemoveModel = (_providerIndex: number, modelIndex: number) => {
    updateEditingProviderData((provider) => {
      const models = Array.isArray(provider.models) ? [...provider.models] : [];
      if (modelIndex < 0 || modelIndex >= models.length) return;
      models.splice(modelIndex, 1);
      provider.models = models;
    });
  };

  const editingProvider = editingProviderData || (editingProviderIndex !== null ? validProviders[editingProviderIndex] : null);

  // Filter providers based on search term
  const filteredProviders = validProviders.filter(provider => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    // Check provider name and URL
    if (
      (provider.name && provider.name.toLowerCase().includes(term)) ||
      (provider.api_base_url && provider.api_base_url.toLowerCase().includes(term))
    ) {
      return true;
    }
    // Check models
    if (provider.models && Array.isArray(provider.models)) {
      return provider.models.some(model => 
        model && model.toLowerCase().includes(term)
      );
    }
    return false;
  });

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="flex flex-col border-b p-4 gap-3">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t("providers.title")} <span className="text-sm font-normal text-gray-500">({filteredProviders.length}/{validProviders.length})</span></CardTitle>
          <Button onClick={handleAddProvider}>{t("providers.add")}</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder={t("providers.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          {searchTerm && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setSearchTerm("")}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4">
        <ProviderList
          providers={filteredProviders}
          onEdit={handleEditProvider}
          onRemove={handleSetDeletingProviderIndex}
        />
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editingProviderIndex !== null} onOpenChange={(open) => {
        if (!open) {
          handleCancelAddProvider();
        }
      }}>
        <DialogContent className="max-h-[80vh] flex flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("providers.edit")}</DialogTitle>
          </DialogHeader>
          {editingProvider && editingProviderIndex !== null && (
            <div className="space-y-4 p-4 overflow-y-auto flex-grow">
              <div className="space-y-2">
                <Label>{t("providers.import_from_template")}</Label>
                <Combobox
                  options={[
                    ...OAUTH_PROVIDER_TEMPLATES.map(p => ({
                      label: `[OAuth] ${p.name}`,
                      value: JSON.stringify(p),
                    })),
                    ...providerTemplates.map(p => ({
                      label: p.name,
                      value: JSON.stringify(p),
                    })),
                  ]}
                  value=""
                  onChange={handleTemplateImport}
                  placeholder={t("providers.select_template")}
                  emptyPlaceholder={t("providers.no_templates_found")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t("providers.name")}</Label>
                <Input 
                  id="name" 
                  value={editingProvider.name || ''} 
                  onChange={(e) => {
                    handleProviderChange(editingProviderIndex, 'name', e.target.value);
                    // Clear name error when user starts typing
                    if (nameError) {
                      setNameError(null);
                    }
                  }}
                  className={nameError ? "border-red-500" : ""}
                />
                {nameError && (
                  <p className="text-sm text-red-500">{nameError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_base_url">{t("providers.api_base_url")}</Label>
                <Input id="api_base_url" value={editingProvider.api_base_url || ''} onChange={(e) => handleProviderChange(editingProviderIndex, 'api_base_url', e.target.value)} />
              </div>
              {editingProvider.auth_type === "oauth" ? (
                <div className="space-y-2">
                  <Label>{t("providers.api_key")}</Label>
                  <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/50">
                    <Badge variant="secondary">{t("providers.oauth_managed", { provider: editingProvider.oauth_provider })}</Badge>
                    <button type="button" onClick={() => { handleCancelAddProvider(); navigate("/oauth"); }} className="text-sm text-blue-600 hover:underline ml-auto">{t("providers.oauth_go_to_settings")}</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="api_key">{t("providers.api_key")}</Label>
                  <div className="relative">
                    <Input
                      id="api_key"
                      type={showApiKey[editingProviderIndex || 0] ? "text" : "password"}
                      value={editingProvider.api_key || ''}
                      onChange={(e) => handleProviderChange(editingProviderIndex, 'api_key', e.target.value)}
                      className={apiKeyError ? "border-red-500" : ""}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
                      onClick={() => {
                        const index = editingProviderIndex || 0;
                        setShowApiKey(prev => ({
                          ...prev,
                          [index]: !prev[index]
                        }));
                      }}
                    >
                      {showApiKey[editingProviderIndex || 0] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {apiKeyError && (
                    <p className="text-sm text-red-500">{apiKeyError}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="models">{t("providers.models")}</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {hasFetchedModels[editingProviderIndex] ? (
                        <ComboInput
                          ref={comboInputRef}
                          options={(editingProvider.models || []).map((model: string) => ({ label: model, value: model }))}
                          value=""
                          onChange={() => {
                            // Only update input value, don't add model
                          }}
                          onEnter={(value) => {
                            if (editingProviderIndex !== null) {
                              handleAddModel(editingProviderIndex, value);
                            }
                          }}
                          inputPlaceholder={t("providers.models_placeholder")}
                        />
                      ) : (
                        <Input 
                          id="models" 
                          placeholder={t("providers.models_placeholder")} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim() && editingProviderIndex !== null) {
                              handleAddModel(editingProviderIndex, e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      )}
                    </div>
                    <Button 
                      onClick={() => {
                        if (hasFetchedModels[editingProviderIndex] && comboInputRef.current) {
                          const currentValue = comboInputRef.current.getCurrentValue();
                          if (currentValue && currentValue.trim() && editingProviderIndex !== null) {
                            handleAddModel(editingProviderIndex, currentValue.trim());
                            comboInputRef.current.clearInput();
                          }
                        } else {
                          // Use plain Input logic
                          const input = document.getElementById('models') as HTMLInputElement;
                          if (input && input.value.trim() && editingProviderIndex !== null) {
                            handleAddModel(editingProviderIndex, input.value);
                            input.value = '';
                          }
                        }
                      }}
                    >
                      {t("providers.add_model")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(editingProvider.models || []).map((model: string, modelIndex: number) => (
                      <Badge key={modelIndex} variant="outline" className="font-normal flex items-center gap-1">
                        {model}
                        <button 
                          type="button" 
                          className="ml-1 rounded-full hover:bg-gray-200"
                          onClick={() => editingProviderIndex !== null && handleRemoveModel(editingProviderIndex, modelIndex)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Provider Transformer Selection */}
              <div className="space-y-2">
                <Label>{t("providers.provider_transformer")}</Label>
                
                {/* Add new transformer */}
                <div className="flex gap-2">
                  <Combobox
                    options={availableTransformers.map(t => ({
                      label: t.name,
                      value: t.name
                    }))}
                    value=""
                    onChange={(value) => {
                      if (editingProviderIndex !== null) {
                        handleProviderTransformerChange(editingProviderIndex, value);
                      }
                    }}
                    placeholder={t("providers.select_transformer")}
                    emptyPlaceholder={t("providers.no_transformers")}
                  />
                </div>
                
                {renderSelectedTransformers({
                  transformers: editingProvider.transformer?.use,
                  getCardKey: (transformerIndex) =>
                    `provider-transformer-${transformerIndex}`,
                  getInputKey: (transformerIndex) =>
                    getProviderParamKey(editingProviderIndex, transformerIndex),
                  paramInputs: providerParamInputs,
                  setParamInputs: setProviderParamInputs,
                  onRemoveTransformer: (transformerIndex) =>
                    removeProviderTransformerAtIndex(
                      editingProviderIndex,
                      transformerIndex
                    ),
                  onAddParameter: (transformerIndex, paramName, paramValue) =>
                    addProviderTransformerParameter(
                      editingProviderIndex,
                      transformerIndex,
                      paramName,
                      paramValue
                    ),
                  onRemoveParameter: (transformerIndex, paramName) =>
                    removeProviderTransformerParameterAtIndex(
                      editingProviderIndex,
                      transformerIndex,
                      paramName
                    ),
                })}
              </div>
              
              {/* Model-specific Transformers */}
              {editingProvider.models && editingProvider.models.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("providers.model_transformers")}</Label>
                  <div className="space-y-3">
                    {(editingProvider.models || []).map((model: string, modelIndex: number) => (
                      <div key={modelIndex} className="border rounded-md p-3">
                        <div className="font-medium text-sm mb-2">{model}</div>
                        {/* Add new transformer */}
                        <div className="flex gap-2">
                          <div className="flex-1 flex gap-2">
                            <Combobox
                              options={availableTransformers.map(t => ({
                                label: t.name,
                                value: t.name
                              }))}
                              value=""
                              onChange={(value) => {
                                if (editingProviderIndex !== null) {
                                  handleModelTransformerChange(editingProviderIndex, model, value);
                                }
                              }}
                              placeholder={t("providers.select_transformer")}
                              emptyPlaceholder={t("providers.no_transformers")}
                            />
                          </div>
                        </div>
                        
                        {renderSelectedTransformers({
                          transformers: editingProvider.transformer?.[model]?.use,
                          getCardKey: (transformerIndex) =>
                            `model-${model}-transformer-${transformerIndex}`,
                          getInputKey: (transformerIndex) =>
                            getModelParamKey(editingProviderIndex, model, transformerIndex),
                          paramInputs: modelParamInputs,
                          setParamInputs: setModelParamInputs,
                          onRemoveTransformer: (transformerIndex) =>
                            removeModelTransformerAtIndex(
                              editingProviderIndex,
                              model,
                              transformerIndex
                            ),
                          onAddParameter: (transformerIndex, paramName, paramValue) =>
                            addModelTransformerParameter(
                              editingProviderIndex,
                              model,
                              transformerIndex,
                              paramName,
                              paramValue
                            ),
                          onRemoveParameter: (transformerIndex, paramName) =>
                            removeModelTransformerParameterAtIndex(
                              editingProviderIndex,
                              model,
                              transformerIndex,
                              paramName
                            ),
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
            </div>
          )}
          <div className="space-y-3 mt-auto">
            <div className="flex justify-end gap-2">
              <Button onClick={handleSaveProvider}>{t("app.save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingProviderIndex !== null} onOpenChange={() => setDeletingProviderIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("providers.delete")}</DialogTitle>
            <DialogDescription>
              {t("providers.delete_provider_confirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingProviderIndex(null)}>{t("providers.cancel")}</Button>
            <Button variant="destructive" onClick={() => deletingProviderIndex !== null && handleRemoveProvider(deletingProviderIndex)}>{t("providers.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
