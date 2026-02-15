import Server, { calculateTokenCount, TokenizerService } from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { homedir } from "os";
import {
  getPresetDir,
  readManifestFromDir,
  manifestToPresetFile,
  saveManifest,
  isPresetInstalled,
  extractPreset,
  HOME_DIR,
  extractMetadata,
  loadConfigFromManifest,
  downloadPresetToTemp,
  getTempDir,
  findMarketPresetByName,
  getMarketPresets,
  type PresetFile,
  type ManifestFile,
  type PresetMetadata,
  listTokens,
  deleteToken,
  getToken,
  isTokenExpired,
  getAvailableOAuthProviders,
  startCopilotLogin,
  startCodexLogin,
  startGeminiLogin,
  startAntigravityLogin,
  fetchOAuthModels,
} from "@CCR/shared";
import fastifyMultipart from "@fastify/multipart";
import AdmZip from "adm-zip";

export const createServer = async (config: any): Promise<any> => {
  const server = new Server(config);
  const app = server.app;

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  app.post("/v1/messages/count_tokens", async (req: any, reply: any) => {
    const {messages, tools, system, model} = req.body;
    const tokenizerService = (app as any)._server!.tokenizerService as TokenizerService;

    // If model is specified in "providerName,modelName" format, use the configured tokenizer
    if (model && model.includes(",") && tokenizerService) {
      try {
        const [provider, modelName] = model.split(",");
        req.log?.info(`Looking up tokenizer for provider: ${provider}, model: ${modelName}`);

        const tokenizerConfig = tokenizerService.getTokenizerConfigForModel(provider, modelName);

        if (!tokenizerConfig) {
          req.log?.warn(`No tokenizer config found for ${provider},${modelName}, using default tiktoken`);
        } else {
          req.log?.info(`Using tokenizer config: ${JSON.stringify(tokenizerConfig)}`);
        }

        const result = await tokenizerService.countTokens(
          { messages, system, tools },
          tokenizerConfig
        );

        return {
          "input_tokens": result.tokenCount,
          "tokenizer": result.tokenizerUsed,
        };
      } catch (error: any) {
        req.log?.error(`Error using configured tokenizer: ${error.message}`);
        req.log?.error(error.stack);
        // Fall back to default calculation
      }
    } else {
      if (!model) {
        req.log?.info(`No model specified, using default tiktoken`);
      } else if (!model.includes(",")) {
        req.log?.info(`Model "${model}" does not contain comma, using default tiktoken`);
      } else if (!tokenizerService) {
        req.log?.warn(`TokenizerService not available, using default tiktoken`);
      }
    }

    // Default to tiktoken calculation
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  app.get("/api/config", async (req: any, reply: any) => {
    return await readConfigFile();
  });

  app.get("/api/transformers", async (req: any, reply: any) => {
    const transformers =
      (app as any)._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  app.post("/api/config", async (req: any, reply: any) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Register static file serving with caching
  app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  app.get("/ui", async (_: any, reply: any) => {
    return reply.redirect("/ui/");
  });

  // Get log file list endpoint
  app.get("/api/logs/files", async (req: any, reply: any) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // Sort by modification time in descending order
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // Get log content endpoint
  app.get("/api/logs", async (req: any, reply: any) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // If file path is specified, use the specified path
        logFilePath = filePath;
      } else {
        // If file path is not specified, use default log file path
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // Clear log content endpoint
  app.delete("/api/logs", async (req: any, reply: any) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // If file path is specified, use the specified path
        logFilePath = filePath;
      } else {
        // If file path is not specified, use default log file path
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // Get presets list
  app.get("/api/presets", async (req: any, reply: any) => {
    try {
      const presetsDir = join(HOME_DIR, "presets");

      if (!existsSync(presetsDir)) {
        return { presets: [] };
      }

      const entries = readdirSync(presetsDir, { withFileTypes: true });
      const presetDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);

      const presets: Array<PresetMetadata & { installed: boolean; id: string }> = [];

      for (const dirName of presetDirs) {
        const presetDir = join(presetsDir, dirName);
        try {
          const manifestPath = join(presetDir, "manifest.json");
          const content = readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(content);

          // Extract metadata fields
          const { Providers, Router, PORT, HOST, API_TIMEOUT_MS, PROXY_URL, LOG, LOG_LEVEL, StatusLine, NON_INTERACTIVE_MODE, ...metadata } = manifest;

          presets.push({
            id: dirName,  // Use directory name as unique identifier
            name: metadata.name || dirName,
            version: metadata.version || '1.0.0',
            description: metadata.description,
            author: metadata.author,
            homepage: metadata.homepage,
            repository: metadata.repository,
            license: metadata.license,
            keywords: metadata.keywords,
            ccrVersion: metadata.ccrVersion,
            source: metadata.source,
            sourceType: metadata.sourceType,
            checksum: metadata.checksum,
            installed: true,
          });
        } catch (error) {
          console.error(`Failed to read preset ${dirName}:`, error);
        }
      }

      return { presets };
    } catch (error) {
      console.error("Failed to get presets:", error);
      reply.status(500).send({ error: "Failed to get presets" });
    }
  });

  // Get preset details
  app.get("/api/presets/:name", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      const manifest = await readManifestFromDir(presetDir);
      const presetFile = manifestToPresetFile(manifest);

      // Return preset info, config uses the applied userValues configuration
      return {
        ...presetFile,
        config: loadConfigFromManifest(manifest, presetDir),
        userValues: manifest.userValues || {},
      };
    } catch (error: any) {
      console.error("Failed to get preset:", error);
      reply.status(500).send({ error: error.message || "Failed to get preset" });
    }
  });

  // Apply preset (configure sensitive information)
  app.post("/api/presets/:name/apply", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const { secrets } = req.body;

      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      // Read existing manifest
      const manifest = await readManifestFromDir(presetDir);

      // Save user input to userValues (keep original config unchanged)
      const updatedManifest: ManifestFile = { ...manifest };

      // Save or update userValues
      if (secrets && Object.keys(secrets).length > 0) {
        updatedManifest.userValues = {
          ...updatedManifest.userValues,
          ...secrets,
        };
      }

      // Save updated manifest
      await saveManifest(name, updatedManifest);

      return { success: true, message: "Preset applied successfully" };
    } catch (error: any) {
      console.error("Failed to apply preset:", error);
      reply.status(500).send({ error: error.message || "Failed to apply preset" });
    }
  });

  // Delete preset
  app.delete("/api/presets/:name", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      // Recursively delete entire directory
      rmSync(presetDir, { recursive: true, force: true });

      return { success: true, message: "Preset deleted successfully" };
    } catch (error: any) {
      console.error("Failed to delete preset:", error);
      reply.status(500).send({ error: error.message || "Failed to delete preset" });
    }
  });

  // Get preset market list
  app.get("/api/presets/market", async (req: any, reply: any) => {
    try {
      // Use market presets function
      const marketPresets = await getMarketPresets();
      return { presets: marketPresets };
    } catch (error: any) {
      console.error("Failed to get market presets:", error);
      reply.status(500).send({ error: error.message || "Failed to get market presets" });
    }
  });

  // Install preset from GitHub repository by preset name
  app.post("/api/presets/install/github", async (req: any, reply: any) => {
    try {
      const { presetName } = req.body;

      if (!presetName) {
        reply.status(400).send({ error: "Preset name is required" });
        return;
      }

      // Check if preset is in the marketplace
      const marketPreset = await findMarketPresetByName(presetName);
      if (!marketPreset) {
        reply.status(400).send({
          error: "Preset not found in marketplace",
          message: `Preset '${presetName}' is not available in the official marketplace. Please check the available presets.`
        });
        return;
      }

      // Get repository from market preset
      if (!marketPreset.repo) {
        reply.status(400).send({
          error: "Invalid preset data",
          message: `Preset '${presetName}' does not have repository information`
        });
        return;
      }

      // Parse GitHub repository URL
      const githubRepoMatch = marketPreset.repo.match(/(?:github\.com[:/]|^)([^/]+)\/([^/\s#]+?)(?:\.git)?$/);
      if (!githubRepoMatch) {
        reply.status(400).send({ error: "Invalid GitHub repository URL" });
        return;
      }

      const [, owner, repoName] = githubRepoMatch;

      // Use preset name from market
      const installedPresetName = marketPreset.name || presetName;

      // Check if already installed BEFORE downloading
      if (await isPresetInstalled(installedPresetName)) {
        reply.status(409).send({
          error: "Preset already installed",
          message: `Preset '${installedPresetName}' is already installed. To update or reconfigure, please delete it first using the delete button.`,
          presetName: installedPresetName
        });
        return;
      }

      // Download GitHub repository ZIP file
      const downloadUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
      const tempFile = await downloadPresetToTemp(downloadUrl);

      // Load preset to validate structure
      const preset = await loadPresetFromZip(tempFile);

      // Double-check if already installed (in case of race condition)
      if (await isPresetInstalled(installedPresetName)) {
        unlinkSync(tempFile);
        reply.status(409).send({
          error: "Preset already installed",
          message: `Preset '${installedPresetName}' was installed while downloading. Please try again.`,
          presetName: installedPresetName
        });
        return;
      }

      // Extract to target directory
      const targetDir = getPresetDir(installedPresetName);
      await extractPreset(tempFile, targetDir);

      // Read manifest and add repo information
      const manifest = await readManifestFromDir(targetDir);

      // Add repo information to manifest from market data
      manifest.repository = marketPreset.repo;
      if (marketPreset.url) {
        manifest.source = marketPreset.url;
      }

      // Save updated manifest
      await saveManifest(installedPresetName, manifest);

      // Clean up temp file
      unlinkSync(tempFile);

      return {
        success: true,
        presetName: installedPresetName,
        preset: {
          ...preset.metadata,
          installed: true,
        }
      };
    } catch (error: any) {
      console.error("Failed to install preset from GitHub:", error);
      reply.status(500).send({ error: error.message || "Failed to install preset from GitHub" });
    }
  });

  // ========== OAuth API endpoints ==========

  // List OAuth providers and their auth status
  app.get("/api/auth/providers", async (req: any, reply: any) => {
    try {
      const availableProviders = getAvailableOAuthProviders();
      const tokens = await listTokens();
      const tokenMap = new Map(tokens.map(t => [t.provider, t.token]));

      const providers = availableProviders.map(name => {
        const token = tokenMap.get(name);
        let status: 'not_authenticated' | 'active' | 'expired' = 'not_authenticated';
        let expiresAt: number | null = null;

        if (token) {
          if (token.type === 'api') {
            status = 'active';
          } else {
            status = isTokenExpired(token) ? 'expired' : 'active';
            expiresAt = token.expires;
          }
        }

        return { name, status, expiresAt };
      });

      return { providers };
    } catch (error: any) {
      console.error("Failed to get auth providers:", error);
      reply.status(500).send({ error: error.message || "Failed to get auth providers" });
    }
  });

  // Start OAuth login for a provider
  app.post("/api/auth/login/:provider", async (req: any, reply: any) => {
    try {
      const { provider } = req.params;

      switch (provider) {
        case "copilot": {
          const { userCode, verificationUri, waitForAuth } = await startCopilotLogin();
          // Don't await — let the client poll for status
          waitForAuth().catch(err => console.error("Copilot auth error:", err.message));
          return {
            flow: "device_code",
            userCode,
            verificationUri,
            message: "Visit the URL and enter the code to authenticate.",
          };
        }
        case "codex": {
          const { authUrl, waitForAuth } = await startCodexLogin();
          waitForAuth().catch(err => console.error("Codex auth error:", err.message));
          return {
            flow: "authorization_code",
            authUrl,
            message: "Visit the URL to authenticate with OpenAI Codex.",
          };
        }
        case "gemini": {
          const { authUrl, waitForAuth } = await startGeminiLogin();
          waitForAuth().catch(err => console.error("Gemini auth error:", err.message));
          return {
            flow: "authorization_code",
            authUrl,
            message: "Visit the URL to authenticate with Google for Gemini.",
          };
        }
        case "antigravity": {
          const { authUrl, waitForAuth } = await startAntigravityLogin();
          waitForAuth().catch(err => console.error("Antigravity auth error:", err.message));
          return {
            flow: "authorization_code",
            authUrl,
            message: "Visit the URL to authenticate with Google for Antigravity.",
          };
        }
        default:
          reply.status(400).send({
            error: `Unknown OAuth provider: ${provider}`,
            available: getAvailableOAuthProviders(),
          });
          return;
      }
    } catch (error: any) {
      console.error("Failed to start OAuth login:", error);
      reply.status(500).send({ error: error.message || "Failed to start OAuth login" });
    }
  });

  // Logout from an OAuth provider
  app.post("/api/auth/logout/:provider", async (req: any, reply: any) => {
    try {
      const { provider } = req.params;
      const deleted = await deleteToken(provider);
      if (deleted) {
        return { success: true, message: `Logged out from ${provider}` };
      }
      reply.status(404).send({ error: `No authentication found for ${provider}` });
    } catch (error: any) {
      console.error("Failed to logout:", error);
      reply.status(500).send({ error: error.message || "Failed to logout" });
    }
  });

  // Get auth status for a specific provider
  app.get("/api/auth/status/:provider", async (req: any, reply: any) => {
    try {
      const { provider } = req.params;
      const token = await getToken(provider);

      if (!token) {
        return { provider, status: 'not_authenticated' };
      }

      if (token.type === 'api') {
        return { provider, status: 'active', type: 'api' };
      }

      return {
        provider,
        status: isTokenExpired(token) ? 'expired' : 'active',
        type: 'oauth',
        expiresAt: token.expires,
      };
    } catch (error: any) {
      console.error("Failed to get auth status:", error);
      reply.status(500).send({ error: error.message || "Failed to get auth status" });
    }
  });

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

  // Fetch available models for an OAuth provider
  app.get("/api/auth/models/:provider", async (req: any, reply: any) => {
    try {
      const { provider } = req.params;
      const models = await fetchOAuthModels(provider);
      return { provider, models };
    } catch (error: any) {
      console.error("Failed to fetch OAuth models:", error);
      reply.status(500).send({ error: error.message || "Failed to fetch models" });
    }
  });

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

  // Helper function: Load preset from ZIP
  async function loadPresetFromZip(zipFile: string): Promise<PresetFile> {
    const zip = new AdmZip(zipFile);

    // First try to find manifest.json in root directory
    let entry = zip.getEntry('manifest.json');

    // If not in root, try to find in subdirectories (handle GitHub repo archive structure)
    if (!entry) {
      const entries = zip.getEntries();
      // Find any manifest.json file
      entry = entries.find(e => e.entryName.includes('manifest.json')) || null;
    }

    if (!entry) {
      throw new Error('Invalid preset file: manifest.json not found');
    }

    const manifest = JSON.parse(entry.getData().toString('utf-8')) as ManifestFile;
    return manifestToPresetFile(manifest);
  }

  return server;
};
