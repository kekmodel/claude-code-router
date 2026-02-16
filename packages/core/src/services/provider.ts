import { TransformerConstructor } from "@/types/transformer";
import {
  LLMProvider,
  RegisterProviderRequest,
  ModelRoute,
  RequestRouteInfo,
  ConfigProvider,
} from "../types/llm";
import { ConfigService } from "./config"; 
import { TransformerService } from "./transformer";

export class ProviderService {
  private providers: Map<string, LLMProvider> = new Map();
  private modelRoutes: Map<string, ModelRoute> = new Map();

  constructor(private readonly configService: ConfigService, private readonly transformerService: TransformerService, private readonly logger: any) {
    this.initializeCustomProviders();
  }

  private initializeCustomProviders() {
    const providersConfig = this.configService.get<ConfigProvider[]>("providers");
    if (providersConfig && Array.isArray(providersConfig)) {
      this.initializeFromProvidersArray(providersConfig);
    }
  }

  private isValidProviderConfig(providerConfig: ConfigProvider): boolean {
    if (
      !providerConfig.name ||
      !providerConfig.api_base_url ||
      (!providerConfig.api_key && providerConfig.auth_type !== "oauth")
    ) {
      return false;
    }

    if (providerConfig.auth_type === "oauth" && !providerConfig.oauth_provider) {
      this.logger.error(
        `Provider ${providerConfig.name}: auth_type is 'oauth' but oauth_provider is not specified`
      );
      return false;
    }

    return true;
  }

  private resolveTransformerInstance(
    transformerConfig: string | any[]
  ): InstanceType<TransformerConstructor> | undefined {
    if (Array.isArray(transformerConfig) && typeof transformerConfig[0] === "string") {
      const Constructor = this.transformerService.getTransformer(transformerConfig[0]);
      if (Constructor) {
        return new (Constructor as TransformerConstructor)(transformerConfig[1]);
      }
      return undefined;
    }

    if (typeof transformerConfig === "string") {
      const transformerInstance = this.transformerService.getTransformer(transformerConfig);
      if (typeof transformerInstance === "function") {
        return new transformerInstance();
      }
      return transformerInstance;
    }

    return undefined;
  }

  private resolveTransformerUse(
    useConfig?: string[] | Array<any>[]
  ): InstanceType<TransformerConstructor>[] | undefined {
    if (!Array.isArray(useConfig)) {
      return undefined;
    }

    const resolved = useConfig
      .map((item) => this.resolveTransformerInstance(item))
      .filter((item): item is InstanceType<TransformerConstructor> => typeof item !== "undefined");

    return resolved.length > 0 ? resolved : undefined;
  }

  private buildTransformerConfig(
    providerConfig: ConfigProvider
  ): LLMProvider["transformer"] | undefined {
    if (!providerConfig.transformer) {
      return undefined;
    }

    const transformer: LLMProvider["transformer"] = {};
    const defaultUse = this.resolveTransformerUse(providerConfig.transformer.use);
    if (defaultUse) {
      transformer.use = defaultUse;
    }

    for (const [key, value] of Object.entries(providerConfig.transformer)) {
      if (key === "use") continue;
      const modelUse = this.resolveTransformerUse(value?.use);
      if (modelUse) {
        transformer[key] = { use: modelUse };
      }
    }

    return Object.keys(transformer).length > 0 ? transformer : undefined;
  }

  private createModelRoute(providerName: string, model: string): ModelRoute {
    return {
      provider: providerName,
      model,
      fullModel: `${providerName},${model}`,
    };
  }

  private rebuildModelRoutes(): void {
    this.modelRoutes.clear();

    this.providers.forEach((provider) => {
      provider.models.forEach((model) => {
        const route = this.createModelRoute(provider.name, model);
        this.modelRoutes.set(route.fullModel, route);
        if (!this.modelRoutes.has(model)) {
          this.modelRoutes.set(model, route);
        }
      });
    });
  }

  private initializeFromProvidersArray(providersConfig: ConfigProvider[]) {
    for (const providerConfig of providersConfig) {
      try {
        if (!this.isValidProviderConfig(providerConfig)) {
          continue;
        }

        this.registerProvider({
          name: providerConfig.name,
          baseUrl: providerConfig.api_base_url,
          apiKey: providerConfig.api_key || "",
          models: providerConfig.models || [],
          authType: providerConfig.auth_type,
          oauthProvider: providerConfig.oauth_provider,
          transformer: this.buildTransformerConfig(providerConfig),
        });

        this.logger.info(`${providerConfig.name} provider registered`);
      } catch (error) {
        this.logger.error(`${providerConfig.name} provider registered error: ${error}`);
      }
    }
  }

  registerProvider(request: RegisterProviderRequest): LLMProvider {
    const provider: LLMProvider = {
      ...request,
    };

    this.providers.set(provider.name, provider);
    this.rebuildModelRoutes();

    return provider;
  }

  getProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  updateProvider(
    id: string,
    updates: Partial<LLMProvider>
  ): LLMProvider | null {
    const provider = this.providers.get(id);
    if (!provider) {
      return null;
    }

    const updatedProvider = {
      ...provider,
      ...updates,
      updatedAt: new Date(),
    };

    this.providers.set(id, updatedProvider);
    this.rebuildModelRoutes();

    return updatedProvider;
  }

  deleteProvider(id: string): boolean {
    const provider = this.providers.get(id);
    if (!provider) {
      return false;
    }

    this.providers.delete(id);
    this.rebuildModelRoutes();
    return true;
  }

  toggleProvider(name: string, enabled: boolean): boolean {
    void enabled;
    const provider = this.providers.get(name);
    if (!provider) {
      return false;
    }
    return true;
  }

  resolveModelRoute(modelName: string): RequestRouteInfo | null {
    const route = this.modelRoutes.get(modelName);
    if (!route) {
      return null;
    }

    const provider = this.providers.get(route.provider);
    if (!provider) {
      return null;
    }

    return {
      provider,
      originalModel: modelName,
      targetModel: route.model,
    };
  }

  getAvailableModelNames(): string[] {
    const modelNames: string[] = [];
    this.providers.forEach((provider) => {
      provider.models.forEach((model) => {
        modelNames.push(model);
        modelNames.push(`${provider.name},${model}`);
      });
    });
    return modelNames;
  }

  getModelRoutes(): ModelRoute[] {
    return Array.from(this.modelRoutes.values());
  }

  async getAvailableModels(): Promise<{
    object: string;
    data: Array<{
      id: string;
      object: string;
      owned_by: string;
      provider: string;
    }>;
  }> {
    const models: Array<{
      id: string;
      object: string;
      owned_by: string;
      provider: string;
    }> = [];

    this.providers.forEach((provider) => {
      provider.models.forEach((model) => {
        models.push({
          id: model,
          object: "model",
          owned_by: provider.name,
          provider: provider.name,
        });

        models.push({
          id: `${provider.name},${model}`,
          object: "model",
          owned_by: provider.name,
          provider: provider.name,
        });
      });
    });

    return {
      object: "list",
      data: models,
    };
  }
}
