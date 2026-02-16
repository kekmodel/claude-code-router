# Claude Code Router

[![License](https://img.shields.io/github/license/musistudio/claude-code-router)](https://github.com/musistudio/claude-code-router/blob/main/LICENSE)

> A powerful tool to route Claude Code requests to different LLM providers, with OAuth authentication support.

## Features

- **Model Routing**: Route requests to different models based on scenarios (background, thinking, long context, web search, image).
- **Multi-Provider Support**: OpenRouter, DeepSeek, Ollama, Gemini, Volcengine, SiliconFlow, and more.
- **OAuth Authentication**: Use subscription-based providers (GitHub Copilot, OpenAI Codex, Google Gemini, Anthropic Claude, Antigravity) without static API keys.
- **Request/Response Transformation**: Customize requests for different provider APIs using transformers.
- **Dynamic Model Switching**: Switch models on-the-fly with `/model provider,model_name`.
- **CLI Model Management**: Manage models and providers from the terminal with `ccr model`.
- **Plugin System**: Extend functionality with custom transformers.
- **Web UI**: Browser-based configuration management.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 8.0.0
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/quickstart) installed globally

### 1. Build from Source

```shell
git clone https://github.com/kekmodel/claude-code-router.git
cd claude-code-router
npm install -g pnpm
pnpm install
pnpm build
npm link
```

This registers the `ccr` command globally. To unlink later:

```shell
npm unlink -g @musistudio/claude-code-router
```

### 2. Configuration

Create `~/.claude-code-router/config.json`:

```json
{
  "APIKEY": "your-secret-key",
  "LOG": true,
  "API_TIMEOUT_MS": 600000,
  "Providers": [
    {
      "name": "codex",
      "api_base_url": "https://chatgpt.com/backend-api/codex/responses",
      "auth_type": "oauth",
      "oauth_provider": "codex",
      "models": ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-mini"],
      "transformer": { "use": ["openai-responses"] }
    },
    {
      "name": "copilot",
      "api_base_url": "https://api.githubcopilot.com",
      "auth_type": "oauth",
      "oauth_provider": "copilot",
      "models": ["claude-opus-4-6", "gpt-4.1", "gpt-5-mini", "gpt-4o"]
    },
    {
      "name": "gemini",
      "api_base_url": "https://generativelanguage.googleapis.com",
      "auth_type": "oauth",
      "oauth_provider": "gemini",
      "models": ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro"],
      "transformer": { "use": ["gemini"] }
    }
  ],
  "Router": {
    "default": "codex,gpt-5.3-codex",
    "background": "copilot,gpt-5-mini",
    "think": "codex,gpt-5.3-codex",
    "longContext": "gemini,gemini-3-pro-preview",
    "longContextThreshold": 60000,
    "webSearch": "copilot,gpt-5-mini",
    "image": "gemini,gemini-3-flash-preview"
  }
}
```

Environment variable interpolation is supported: use `$VAR_NAME` or `${VAR_NAME}` to reference environment variables instead of hardcoding API keys.

#### Configuration Options

| Key | Required | Description |
|-----|----------|-------------|
| `APIKEY` | No | Secret key for client authentication |
| `HOST` | No | Server host (forced to `127.0.0.1` without APIKEY) |
| `PORT` | No | Server port (default: 3456) |
| `PROXY_URL` | No | Proxy URL for API requests |
| `LOG` | No | Enable logging (default: `true`) |
| `LOG_LEVEL` | No | Log level: fatal/error/warn/info/debug/trace |
| `API_TIMEOUT_MS` | No | API call timeout in milliseconds |
| `NON_INTERACTIVE_MODE` | No | Enable for CI/CD environments |

### 3. Running

```shell
# Start the server
ccr start

# Run Claude Code through the router
ccr code

# Restart after config changes
ccr restart
```

### 4. Web UI

```shell
ccr ui
```

Opens a browser-based interface for managing providers, router, transformers, presets, and OAuth authentication.

### 5. CLI Model Management

```shell
ccr model
```

Interactive interface to view, switch, and add models/providers.

### 6. Shell Integration

```shell
eval "$(ccr activate)"
```

Sets environment variables (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, etc.) so the `claude` command and Agent SDK applications automatically route through CCR.

## OAuth Authentication

CCR supports OAuth authentication for subscription-based providers. Instead of static API keys, authenticate through your existing subscriptions.

### Supported Providers

| Provider | Flow | Description |
|----------|------|-------------|
| `copilot` | Device Code | GitHub Copilot (gpt-4o, claude-sonnet, etc.) |
| `codex` | Auth Code + PKCE | OpenAI Codex (ChatGPT Plus/Pro subscription) |
| `gemini` | Google OAuth | Google Gemini (Code Assist subscription) |
| `anthropic` | Auth Code + PKCE | Anthropic Claude (Pro/Max subscription) |
| `antigravity` | Google OAuth | Antigravity (Claude/Gemini models) |

### CLI Commands

```shell
# Login to a provider
ccr auth login copilot
ccr auth login codex
ccr auth login gemini

# Check authentication status
ccr auth status
ccr auth list

# Logout
ccr auth logout copilot
```

### OAuth Provider Configuration

OAuth providers use `auth_type` and `oauth_provider` instead of `api_key`:

```json
{
  "Providers": [
    {
      "name": "copilot",
      "api_base_url": "https://api.githubcopilot.com",
      "auth_type": "oauth",
      "oauth_provider": "copilot",
      "models": ["claude-opus-4-6", "gpt-5.2-codex", "gpt-4.1", "claude-haiku-4.5", "gpt-5-mini", "gpt-4o"]
    },
    {
      "name": "codex",
      "api_base_url": "https://api.openai.com",
      "auth_type": "oauth",
      "oauth_provider": "codex",
      "models": ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-mini"]
    },
    {
      "name": "gemini",
      "api_base_url": "https://generativelanguage.googleapis.com",
      "auth_type": "oauth",
      "oauth_provider": "gemini",
      "models": ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"]
    },
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "$OPENROUTER_API_KEY",
      "models": ["anthropic/claude-sonnet-4"],
      "transformer": { "use": ["openrouter"] }
    }
  ]
}
```

OAuth tokens are stored in `~/.claude-code-router/auth.json` with `0600` permissions. Tokens are automatically refreshed when expired.

## Providers

Each provider in the `Providers` array requires:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique provider name |
| `api_base_url` | Yes | Full API endpoint |
| `api_key` | Conditional | API key (required unless using OAuth) |
| `auth_type` | No | `"oauth"` for OAuth providers |
| `oauth_provider` | Conditional | OAuth provider name (required when `auth_type` is `"oauth"`) |
| `models` | Yes | Available model names |
| `transformer` | No | Request/response transformers |

## Transformers

Transformers adapt requests/responses for different provider APIs.

**Global** — applies to all models of a provider:
```json
{ "transformer": { "use": ["openrouter"] } }
```

**Model-specific** — additional transformer for a single model:
```json
{
  "transformer": {
    "use": ["deepseek"],
    "deepseek-chat": { "use": ["tooluse"] }
  }
}
```

**With options** — pass configuration to a transformer:
```json
{ "transformer": { "use": [["maxtoken", { "max_tokens": 16384 }]] } }
```

### Built-in Transformers

| Transformer | Description |
|-------------|-------------|
| `anthropic` | Preserves original Anthropic request/response |
| `deepseek` | Adapts for DeepSeek API |
| `gemini` | Adapts for Gemini API |
| `openrouter` | Adapts for OpenRouter API (supports provider routing) |
| `groq` | Adapts for Groq API |
| `maxtoken` | Sets `max_tokens` value |
| `tooluse` | Optimizes tool usage via `tool_choice` |
| `reasoning` | Processes `reasoning_content` field |
| `sampling` | Processes sampling parameters (temperature, top_p, etc.) |
| `enhancetool` | Error tolerance for tool call parameters (non-streaming) |
| `cleancache` | Clears `cache_control` field |
| `vertex-gemini` | Gemini API via Vertex authentication |

**Custom transformers** can be loaded via the `transformers` field:
```json
{
  "transformers": [
    { "path": "/path/to/custom-transformer.js", "options": {} }
  ]
}
```

## Router

The `Router` object defines model routing per scenario:

| Key | Description |
|-----|-------------|
| `default` | Default model for general tasks |
| `background` | Background tasks (lightweight model) |
| `think` | Reasoning-heavy tasks (Plan Mode) |
| `longContext` | Long context requests (> threshold tokens) |
| `longContextThreshold` | Token threshold for long context (default: 60000) |
| `webSearch` | Web search tasks (model must support it) |
| `image` | Image-related tasks (beta) |

Dynamic switching in Claude Code: `/model provider_name,model_name`

### Custom Router

For advanced routing logic, set `CUSTOM_ROUTER_PATH` to a JavaScript module:

```json
{ "CUSTOM_ROUTER_PATH": "/path/to/custom-router.js" }
```

```javascript
module.exports = async function router(req, config) {
  const userMessage = req.body.messages.find(m => m.role === "user")?.content;
  if (userMessage && userMessage.includes("explain this code")) {
    return "openrouter,anthropic/claude-sonnet-4";
  }
  return null; // fallback to default
};
```

### Subagent Routing

Specify models for subagents by adding at the beginning of the prompt:

```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Presets

Save, share, and reuse configurations:

```shell
ccr preset export my-preset
ccr preset list
ccr preset info my-preset
ccr preset install /path/to/preset
ccr preset delete my-preset
ccr install my-preset              # Install from marketplace
```

Sensitive data (API keys) is automatically sanitized during export.

## Status Line (Beta)

Monitor CCR status at runtime. Enable via `ccr ui`.

## GitHub Actions

After setting up [Claude Code Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions):

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Setup
    run: |
      curl -fsSL https://bun.sh/install | bash
      mkdir -p $HOME/.claude-code-router
      cat << 'EOF' > $HOME/.claude-code-router/config.json
      {
        "LOG": true,
        "NON_INTERACTIVE_MODE": true,
        "Providers": [...]
      }
      EOF

  - name: Start Router
    run: nohup ~/.bun/bin/bunx @musistudio/claude-code-router start &

  - name: Run Claude Code
    uses: anthropics/claude-code-action@beta
    env:
      ANTHROPIC_BASE_URL: http://localhost:3456
    with:
      anthropic_api_key: "any-string-is-ok"
```

Set `"NON_INTERACTIVE_MODE": true` for CI/CD environments.

## CLI Reference

| Command | Description |
|---------|-------------|
| `ccr start` | Start server |
| `ccr stop` | Stop server |
| `ccr restart` | Restart server |
| `ccr status` | Show status |
| `ccr code` | Run Claude Code through the router |
| `ccr model` | Interactive model selection |
| `ccr ui` | Open Web UI |
| `ccr auth login <provider>` | OAuth login |
| `ccr auth logout <provider>` | OAuth logout |
| `ccr auth list` | List authentications |
| `ccr auth status` | Show auth status |
| `ccr preset <subcommand>` | Manage presets |
| `ccr activate` | Output shell env vars |
| `ccr statusline` | Integrated status line |

## License

[MIT](LICENSE)
