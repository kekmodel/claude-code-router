---
sidebar_position: 5
---

# ccr auth

Manage OAuth authentication for subscription-based LLM providers.

## Usage

```bash
ccr auth <command> [provider]
```

## Commands

### login

Authenticate with an OAuth provider.

```bash
ccr auth login <provider>
```

**Available providers:**

| Provider | Flow | Description |
|----------|------|-------------|
| `copilot` | Device Code | GitHub Copilot |
| `codex` | Auth Code + PKCE | OpenAI Codex (ChatGPT Plus/Pro) |
| `gemini` | Google OAuth | Google Gemini |
| `antigravity` | Google OAuth | Antigravity (Gemini + Claude models) |

**Examples:**

```bash
ccr auth login copilot        # GitHub Copilot
ccr auth login codex          # OpenAI Codex
ccr auth login gemini         # Google Gemini
ccr auth login antigravity    # Antigravity
```

After successful login, the CLI outputs a sample provider configuration block you can add to `config.json`.

### logout

Remove stored authentication for a provider.

```bash
ccr auth logout <provider>
```

### list

List all stored authentications with type, status, and expiration.

```bash
ccr auth list
```

### status

Show authentication status for a specific provider, or all providers if none specified.

```bash
ccr auth status [provider]
```

## After Login

Once authenticated, configure the provider in `config.json` using `auth_type: "oauth"`:

```json
{
  "name": "copilot",
  "api_base_url": "https://api.githubcopilot.com",
  "auth_type": "oauth",
  "oauth_provider": "copilot",
  "models": ["gpt-4o", "claude-sonnet-4-5"]
}
```

Then restart the server:

```bash
ccr restart
```

## Related

- [OAuth Authentication Guide](/docs/server/advanced/oauth) — detailed OAuth setup and architecture
- [Providers Configuration](/docs/server/config/providers) — provider configuration reference
