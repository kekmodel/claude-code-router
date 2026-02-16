---
sidebar_position: 2
---

# OAuth Authentication

OAuth support allows providers to authenticate via subscription-based services (e.g., GitHub Copilot, ChatGPT Plus, Google Gemini) instead of static API keys.

## Overview

Instead of configuring an `api_key` for each provider, you can use OAuth to authenticate with supported services. Tokens are managed automatically — including refresh when expired.

**Token storage:** `~/.claude-code-router/auth.json` (file permissions `0600`)

## Supported Providers

| Provider | Flow | Service | Models |
|----------|------|---------|--------|
| `copilot` | Device Code | GitHub Copilot | `gpt-4o`, `claude-sonnet-4-5`, etc. |
| `codex` | Auth Code + PKCE | ChatGPT Plus/Pro | `gpt-4o`, `o3-mini`, `codex-mini` |
| `gemini` | Google OAuth | Google Gemini | `gemini-2.5-pro`, `gemini-2.5-flash` |
| `antigravity` | Google OAuth | Antigravity Cloud | Gemini + Claude models |

## Quick Start

### 1. Login

```bash
ccr auth login copilot
```

The CLI will guide you through the authentication flow (browser-based).

### 2. Configure Provider

Add an OAuth provider to your `config.json`:

```json
{
  "Providers": [
    {
      "name": "copilot",
      "api_base_url": "https://api.githubcopilot.com",
      "auth_type": "oauth",
      "oauth_provider": "copilot",
      "models": ["gpt-4o", "claude-sonnet-4-5"]
    }
  ]
}
```

Key fields:
- `auth_type`: Set to `"oauth"` (replaces `api_key`)
- `oauth_provider`: Must match one of the supported provider names

### 3. Restart Server

```bash
ccr restart
```

## Provider Setup Details

### GitHub Copilot

Uses **Device Code Flow** — you visit a URL and enter a code.

```bash
ccr auth login copilot
```

```json
{
  "name": "copilot",
  "api_base_url": "https://api.githubcopilot.com",
  "auth_type": "oauth",
  "oauth_provider": "copilot",
  "models": ["gpt-4o", "claude-sonnet-4-5"]
}
```

Requires an active GitHub Copilot subscription.

### OpenAI Codex

Uses **Authorization Code + PKCE** — opens a browser for login.

```bash
ccr auth login codex
```

```json
{
  "name": "codex",
  "api_base_url": "https://api.openai.com",
  "auth_type": "oauth",
  "oauth_provider": "codex",
  "models": ["gpt-4o", "o3-mini", "codex-mini"]
}
```

Requires a ChatGPT Plus or Pro subscription. The `chatgpt-account-id` header is automatically extracted from the token.

### Google Gemini

Uses **Google OAuth** — opens a browser for Google sign-in.

```bash
ccr auth login gemini
```

```json
{
  "name": "gemini",
  "api_base_url": "https://generativelanguage.googleapis.com",
  "auth_type": "oauth",
  "oauth_provider": "gemini",
  "models": ["gemini-2.5-pro", "gemini-2.5-flash"]
}
```

### Antigravity

Uses **Google OAuth** — provides access to both Gemini and Claude models via Google's Cloud Code endpoints.

```bash
ccr auth login antigravity
```

```json
{
  "name": "antigravity",
  "api_base_url": "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "auth_type": "oauth",
  "oauth_provider": "antigravity",
  "models": [
    "gemini-2.5-pro", "gemini-2.5-flash",
    "gemini-3-pro", "gemini-3-flash",
    "claude-sonnet-4-5", "claude-sonnet-4-5-thinking", "claude-opus-4-6-thinking"
  ]
}
```

## Managing Tokens

### List authentications

```bash
ccr auth list
```

Shows all stored tokens with type, status, and expiration.

### Check status

```bash
ccr auth status copilot
```

### Logout

```bash
ccr auth logout copilot
```

## Server API Endpoints

When the CCR server is running, OAuth can also be managed via HTTP API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/providers` | List providers and their auth status |
| `POST` | `/api/auth/login/:provider` | Start OAuth login flow |
| `POST` | `/api/auth/logout/:provider` | Remove stored tokens |
| `GET` | `/api/auth/status/:provider` | Get token status for a provider |
| `GET` | `/api/auth/models/:provider` | Fetch available models |

The Web UI OAuth management page (`/oauth`) uses these endpoints.

## How It Works

1. **Login**: CLI starts the OAuth flow (Device Code or Auth Code + PKCE)
2. **Token storage**: Tokens are saved to `~/.claude-code-router/auth.json`
3. **Request time**: Server calls `getApiKey()` on the provider to get a valid access token
4. **Auto-refresh**: Expired tokens are automatically refreshed using the stored refresh token
5. **Extra headers**: Some providers inject additional headers (e.g., Codex's `chatgpt-account-id`)

## CLI vs Server Login

For Auth Code providers (codex, gemini, antigravity), the CLI delegates to the running CCR server when possible. This ensures:
- The Web UI and CLI share a single OAuth callback server
- No port conflicts between concurrent login attempts
- Token state stays synchronized

If the server is not running, the CLI handles the OAuth flow directly.
