/**
 * ccr auth - OAuth authentication management commands
 *
 * For Authorization Code providers (codex, gemini, anthropic, antigravity),
 * the CLI delegates to the running CCR server via API when possible.
 * This ensures the WebUI and CLI share a single OAuth callback server,
 * preventing port conflicts and state mismatch issues.
 */

import {
  startCopilotLogin,
  startCodexLogin,
  startGeminiLogin,
  startAntigravityLogin,
  listTokens,
  deleteToken,
  getToken,
  isTokenExpired,
  getAvailableOAuthProviders,
} from "@CCR/shared";
import { readConfigFile } from ".";
import { exec } from "child_process";

const AUTH_HELP = `
Usage: ccr auth <command> [provider]

Commands:
  login <provider>    Authenticate with an OAuth provider
  logout <provider>   Remove stored authentication
  list                List all stored authentications
  status [provider]   Show authentication status

Available OAuth providers:
  copilot             GitHub Copilot (Device Code Flow)
  codex               OpenAI Codex (Auth Code + PKCE)
  gemini              Google Gemini (Google OAuth)
  antigravity         Antigravity (Google OAuth, Gemini + Claude models)

Examples:
  ccr auth login copilot
  ccr auth login codex
  ccr auth login gemini
  ccr auth login antigravity
  ccr auth logout copilot
  ccr auth list
  ccr auth status
`;

type AuthCodeLoginResult = {
  authUrl: string;
  waitForAuth: () => Promise<unknown>;
};

type AuthCodeProviderConfig = {
  label: string;
  startLogin: () => Promise<AuthCodeLoginResult>;
  description?: string;
  configExample: string;
};

// Auth Code provider configurations (Copilot uses Device Code Flow separately)
const AUTH_CODE_PROVIDERS: Record<string, AuthCodeProviderConfig> = {
  codex: {
    label: "OpenAI Codex",
    startLogin: startCodexLogin,
    description: "Requires a ChatGPT Plus/Pro subscription.",
    configExample: `
  {
    "name": "codex",
    "api_base_url": "https://api.openai.com",
    "auth_type": "oauth",
    "oauth_provider": "codex",
    "models": ["gpt-4o", "o3-mini", "codex-mini"]
  }
`,
  },
  gemini: {
    label: "Google Gemini",
    startLogin: startGeminiLogin,
    configExample: `
  {
    "name": "gemini",
    "api_base_url": "https://generativelanguage.googleapis.com",
    "auth_type": "oauth",
    "oauth_provider": "gemini",
    "models": ["gemini-2.5-pro", "gemini-2.5-flash"]
  }
`,
  },
  antigravity: {
    label: "Antigravity",
    startLogin: startAntigravityLogin,
    description: "Antigravity provides access to both Gemini and Claude models.",
    configExample: `
  {
    "name": "antigravity",
    "api_base_url": "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "auth_type": "oauth",
    "oauth_provider": "antigravity",
    "models": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro", "gemini-3-flash",
               "claude-sonnet-4-5", "claude-sonnet-4-5-thinking", "claude-opus-4-6-thinking"]
  }
`,
  },
};

function isHelpFlag(value?: string): boolean {
  return !value || value === "--help" || value === "-h";
}

function printProviderUsage(action: "login" | "logout"): void {
  console.log(`Usage: ccr auth ${action} <provider>\n`);
  console.log("Available providers:", getAvailableOAuthProviders().join(", "));
}

/**
 * Read server connection config for API calls
 */
async function getServerFetchConfig(): Promise<{ port: number; headers: Record<string, string> }> {
  const config = await readConfigFile();
  const port = config.PORT || 3456;
  const apiKey = config.APIKEY || "";
  return {
    port,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  };
}

function printBrowserInstructions(url: string): void {
  console.log("Opening browser for authentication...\n");
  openBrowser(url);
  console.log("If the browser didn't open, visit:");
  console.log(`  ${url}\n`);
  console.log("Waiting for authorization...");
}

async function printAuthSuccess(providerName: string): Promise<void> {
  const token = await getToken(providerName);
  console.log("\nAuthentication successful!");
  if (token?.type === "oauth") {
    console.log(`Token expires: ${new Date(token.expires).toLocaleString()}`);
  }
}

/**
 * Try to start an OAuth login via the running CCR server.
 * Returns the authUrl on success, or null if the server is not reachable.
 */
async function tryServerLogin(provider: string): Promise<string | null> {
  try {
    const { port, headers } = await getServerFetchConfig();
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login/${provider}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as any;
    return data.authUrl || null;
  } catch {
    return null;
  }
}

/**
 * Poll the CCR server for auth status until the provider is authenticated.
 * Returns true when authenticated, throws on timeout.
 */
async function pollAuthStatus(provider: string, timeoutMs = 300_000): Promise<void> {
  const { port, headers } = await getServerFetchConfig();
  const url = `http://127.0.0.1:${port}/api/auth/status/${provider}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = (await response.json()) as any;
        if (data.status === "authenticated" || data.status === "active") {
          return;
        }
      }
    } catch {
      // Server may have gone down; keep trying
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Authentication timed out. Please try again.");
}

/**
 * Shared Auth Code login flow: delegates to running CCR server when possible,
 * otherwise runs the OAuth flow directly. Handles browser opening and success output.
 */
async function loginWithAuthCode(
  providerName: string,
  startLogin: () => Promise<AuthCodeLoginResult>
): Promise<void> {
  const serverAuthUrl = await tryServerLogin(providerName);
  if (serverAuthUrl) {
    printBrowserInstructions(serverAuthUrl);
    await pollAuthStatus(providerName);
  } else {
    const { authUrl, waitForAuth } = await startLogin();
    printBrowserInstructions(authUrl);
    await waitForAuth();
  }
  await printAuthSuccess(providerName);
}

/**
 * Handle auth command dispatch
 */
export async function handleAuthCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  const provider = args[1];

  if (isHelpFlag(subcommand)) {
    console.log(AUTH_HELP);
    return;
  }

  switch (subcommand) {
    case "login":
      if (isHelpFlag(provider)) {
        printProviderUsage("login");
        return;
      }
      await handleLogin(provider);
      break;
    case "logout":
      if (isHelpFlag(provider)) {
        printProviderUsage("logout");
        return;
      }
      await handleLogout(provider);
      break;
    case "list":
      await handleList();
      break;
    case "status":
      await handleStatus(provider);
      break;
    default:
      console.log(AUTH_HELP);
      break;
  }
}

/**
 * Login to an OAuth provider
 */
async function handleLogin(provider: string): Promise<void> {
  // Copilot uses Device Code Flow — fundamentally different from Auth Code providers
  if (provider === "copilot") {
    await loginCopilot();
    return;
  }

  const providerConfig = AUTH_CODE_PROVIDERS[provider];
  if (!providerConfig) {
    console.error(`Unknown OAuth provider: ${provider}`);
    console.log("Available providers:", getAvailableOAuthProviders().join(", "));
    process.exit(1);
  }

  const { label, startLogin, description, configExample } = providerConfig;
  console.log(`Authenticating with ${label}...\n`);
  if (description) console.log(`${description}\n`);

  try {
    await loginWithAuthCode(provider, startLogin);
    console.log(`\nYou can now use ${label} models in your config:`);
    console.log(configExample);
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

/**
 * GitHub Copilot login via Device Code Flow
 */
async function loginCopilot(): Promise<void> {
  console.log("Authenticating with GitHub Copilot...\n");

  try {
    const { userCode, verificationUri, waitForAuth } = await startCopilotLogin();

    console.log("Please visit the following URL and enter the code:\n");
    console.log(`  URL:  ${verificationUri}`);
    console.log(`  Code: ${userCode}\n`);

    openBrowser(verificationUri);
    console.log("Waiting for authorization...");

    const token = await waitForAuth();

    console.log("\nAuthentication successful!");
    console.log(`Token expires: ${new Date(token.expires).toLocaleString()}`);
    console.log("\nYou can now use GitHub Copilot models in your config:");
    console.log(`
  {
    "name": "copilot",
    "api_base_url": "https://api.githubcopilot.com",
    "auth_type": "oauth",
    "oauth_provider": "copilot",
    "models": ["gpt-4o", "claude-sonnet-4-5"]
  }
`);
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

/**
 * Logout from a provider
 */
async function handleLogout(provider: string): Promise<void> {
  const deleted = await deleteToken(provider);
  if (deleted) {
    console.log(`Successfully logged out from ${provider}.`);
  } else {
    console.log(`No authentication found for ${provider}.`);
  }
}

/**
 * List all stored authentications
 */
async function handleList(): Promise<void> {
  const tokens = await listTokens();

  if (tokens.length === 0) {
    console.log("No stored authentications.");
    console.log("Use `ccr auth login <provider>` to authenticate.");
    return;
  }

  console.log("Stored authentications:\n");
  for (const { provider, token } of tokens) {
    if (token.type === 'oauth') {
      const expired = isTokenExpired(token);
      const status = expired ? "EXPIRED" : "ACTIVE";
      const expiresStr = token.expires
        ? new Date(token.expires).toLocaleString()
        : "N/A";
      console.log(`  ${provider}`);
      console.log(`    Type:    OAuth`);
      console.log(`    Status:  ${status}`);
      console.log(`    Expires: ${expiresStr}`);
      console.log();
    } else {
      console.log(`  ${provider}`);
      console.log(`    Type:   API Key`);
      console.log(`    Status: ACTIVE`);
      console.log(`    Key:    ${token.key.slice(0, 8)}...`);
      console.log();
    }
  }
}

/**
 * Show authentication status
 */
async function handleStatus(provider?: string): Promise<void> {
  if (provider) {
    const token = await getToken(provider);
    if (!token) {
      console.log(`No authentication found for ${provider}.`);
      return;
    }

    if (token.type === 'oauth') {
      const expired = isTokenExpired(token);
      const status = expired
        ? `EXPIRED - run \`ccr auth login ${provider}\` to re-authenticate`
        : "ACTIVE";
      console.log(`${provider}:`);
      console.log(`  Type:    OAuth`);
      console.log(`  Status:  ${status}`);
      if (token.expires) {
        console.log(`  Expires: ${new Date(token.expires).toLocaleString()}`);
      }
    } else {
      console.log(`${provider}:`);
      console.log(`  Type:   API Key`);
      console.log(`  Status: ACTIVE`);
    }
  } else {
    // Show status for all providers
    await handleList();
  }
}

/**
 * Open a URL in the default browser
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  // URL must be quoted to prevent shell from interpreting & as background operator
  if (platform === "win32") {
    command = `start "" "${url}"`;
  } else if (platform === "darwin") {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      // Silently fail — user can open the URL manually
    }
  });
}
