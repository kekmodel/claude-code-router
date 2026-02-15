/**
 * ccr auth - OAuth authentication management commands
 */

import {
  startCopilotLogin,
  startAnthropicLogin,
  startAntigravityLogin,
  startCodexLogin,
  startGeminiLogin,
  listTokens,
  deleteToken,
  getToken,
  isTokenExpired,
  getAvailableOAuthProviders,
} from "@CCR/shared";
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
  anthropic           Anthropic Claude (Auth Code + PKCE)
  antigravity         Antigravity via Google OAuth
  codex               OpenAI Codex (Auth Code + PKCE)
  gemini              Google Gemini (Google OAuth)

Examples:
  ccr auth login copilot
  ccr auth login anthropic
  ccr auth logout copilot
  ccr auth list
  ccr auth status
`;

/**
 * Handle auth command dispatch
 */
export async function handleAuthCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  const provider = args[1];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(AUTH_HELP);
    return;
  }

  switch (subcommand) {
    case "login":
      if (!provider || provider === "--help" || provider === "-h") {
        console.log("Usage: ccr auth login <provider>\n");
        console.log("Available providers:", getAvailableOAuthProviders().join(", "));
        return;
      }
      await handleLogin(provider);
      break;
    case "logout":
      if (!provider || provider === "--help" || provider === "-h") {
        console.log("Usage: ccr auth logout <provider>\n");
        console.log("Available providers:", getAvailableOAuthProviders().join(", "));
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
  switch (provider) {
    case "copilot":
      await loginCopilot();
      break;
    case "anthropic":
      await loginAnthropicClaude();
      break;
    case "antigravity":
      await loginAntigravity();
      break;
    case "codex":
      await loginCodex();
      break;
    case "gemini":
      await loginGemini();
      break;
    default:
      console.error(`Unknown OAuth provider: ${provider}`);
      console.log("Available providers:", getAvailableOAuthProviders().join(", "));
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

    // Try to open browser automatically
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
 * Anthropic Claude login via Authorization Code + PKCE
 */
async function loginAnthropicClaude(): Promise<void> {
  console.log("Authenticating with Anthropic Claude...\n");
  console.log("WARNING: Anthropic may restrict third-party OAuth access.");
  console.log("This feature may stop working if Anthropic changes their ToS.\n");

  try {
    const { authUrl, waitForAuth } = await startAnthropicLogin();

    console.log("Opening browser for authentication...\n");
    openBrowser(authUrl);
    console.log("If the browser didn't open, visit:");
    console.log(`  ${authUrl}\n`);
    console.log("Waiting for authorization...");

    const token = await waitForAuth();

    console.log("\nAuthentication successful!");
    console.log(`Token expires: ${new Date(token.expires).toLocaleString()}`);
    console.log("\nYou can now use Anthropic Claude with OAuth in your config:");
    console.log(`
  {
    "name": "anthropic-oauth",
    "api_base_url": "https://api.anthropic.com",
    "auth_type": "oauth",
    "oauth_provider": "anthropic",
    "models": ["claude-sonnet-4-5-20250929"]
  }
`);
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

/**
 * Antigravity login via Google OAuth
 */
async function loginAntigravity(): Promise<void> {
  console.log("Authenticating with Antigravity via Google...\n");

  try {
    const { authUrl, waitForAuth } = await startAntigravityLogin();

    console.log("Opening browser for Google authentication...\n");
    openBrowser(authUrl);
    console.log("If the browser didn't open, visit:");
    console.log(`  ${authUrl}\n`);
    console.log("Waiting for authorization...");

    const token = await waitForAuth();

    console.log("\nAuthentication successful!");
    console.log(`Token expires: ${new Date(token.expires).toLocaleString()}`);
    console.log("\nYou can now use Antigravity models in your config:");
    console.log(`
  {
    "name": "antigravity",
    "api_base_url": "https://antigravity.tools/api/v1",
    "auth_type": "oauth",
    "oauth_provider": "antigravity",
    "models": ["claude-sonnet-4-5", "gemini-2.5-pro"]
  }
`);
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

/**
 * OpenAI Codex login via Authorization Code + PKCE
 */
async function loginCodex(): Promise<void> {
  console.log("Authenticating with OpenAI Codex...\n");
  console.log("Requires a ChatGPT Plus/Pro subscription.\n");

  try {
    const { authUrl, waitForAuth } = await startCodexLogin();

    console.log("Opening browser for authentication...\n");
    openBrowser(authUrl);
    console.log("If the browser didn't open, visit:");
    console.log(`  ${authUrl}\n`);
    console.log("Waiting for authorization...");

    const token = await waitForAuth();

    console.log("\nAuthentication successful!");
    console.log(`Token expires: ${new Date(token.expires).toLocaleString()}`);
    console.log("\nYou can now use OpenAI Codex models in your config:");
    console.log(`
  {
    "name": "codex",
    "api_base_url": "https://api.openai.com",
    "auth_type": "oauth",
    "oauth_provider": "codex",
    "models": ["gpt-4o", "o3-mini", "codex-mini"]
  }
`);
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

/**
 * Google Gemini login via Google OAuth
 */
async function loginGemini(): Promise<void> {
  console.log("Authenticating with Google Gemini...\n");

  try {
    const { authUrl, waitForAuth } = await startGeminiLogin();

    console.log("Opening browser for Google authentication...\n");
    openBrowser(authUrl);
    console.log("If the browser didn't open, visit:");
    console.log(`  ${authUrl}\n`);
    console.log("Waiting for authorization...");

    const token = await waitForAuth();

    console.log("\nAuthentication successful!");
    console.log(`Token expires: ${new Date(token.expires).toLocaleString()}`);
    console.log("\nYou can now use Google Gemini models in your config:");
    console.log(`
  {
    "name": "gemini",
    "api_base_url": "https://generativelanguage.googleapis.com",
    "auth_type": "oauth",
    "oauth_provider": "gemini",
    "models": ["gemini-2.5-pro", "gemini-2.5-flash"]
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
      console.log(`${provider}:`);
      console.log(`  Type:    OAuth`);
      console.log(`  Status:  ${expired ? "EXPIRED - run `ccr auth login " + provider + "` to re-authenticate" : "ACTIVE"}`);
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

  if (platform === "win32") {
    command = `start ${url}`;
  } else if (platform === "darwin") {
    command = `open ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }

  exec(command, (error) => {
    if (error) {
      // Silently fail — user can open the URL manually
    }
  });
}
