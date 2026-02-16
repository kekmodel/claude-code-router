# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Router is a tool that routes Claude Code requests to different LLM providers. It uses a Monorepo architecture with five main packages:

- **cli** (`@CCR/cli`): Command-line tool providing the `ccr` command
- **core** (`@musistudio/llms`): Universal LLM API transformation server (request/response transformations, provider adapters)
- **server** (`@CCR/server`): Core server handling API routing and stream processing
- **shared** (`@CCR/shared`): Shared constants, utilities, preset management, and OAuth authentication
- **ui** (`@CCR/ui`): Web management interface (React + Vite + Tailwind CSS + Radix UI) — includes OAuth management page at `/oauth`

Additional workspaces:
- **docs** (`claude-code-router-docs`): Documentation site (Docusaurus)

## Build Commands

### Build all packages
```bash
pnpm build          # Builds in order: shared → core → server → cli → ui
```

**Build order matters** — packages depend on each other. The root `build` script handles the correct sequence automatically.

### Build individual packages
```bash
pnpm build:shared   # Build Shared (must be first)
pnpm build:core     # Build Core (@musistudio/llms)
pnpm build:server   # Build Server
pnpm build:cli      # Build CLI
pnpm build:ui       # Build UI
pnpm build:docs     # Build Documentation site
```

### Development mode
```bash
pnpm dev:cli        # Develop CLI (ts-node)
pnpm dev:server     # Develop Server (ts-node)
pnpm dev:core       # Develop Core (nodemon)
pnpm dev:ui         # Develop UI (Vite)
pnpm dev:docs       # Develop Docs (Docusaurus)
```

### Lint
```bash
pnpm --filter @musistudio/llms lint   # Lint core
pnpm --filter @CCR/ui lint            # Lint UI
```

### Publish
```bash
pnpm release        # Build and publish all packages
```

## Core Architecture

### 1. Routing System (packages/server/src/utils/router.ts)

The routing logic determines which model a request should be sent to:

- **Default routing**: Uses `Router.default` configuration
- **Project-level routing**: Checks `~/.claude/projects/<project-id>/claude-code-router.json`
- **Custom routing**: Loads custom JavaScript router function via `CUSTOM_ROUTER_PATH`
- **Built-in scenario routing**:
  - `default`: Fallback when no other scenario matches
  - `background`: Background tasks (typically lightweight models)
  - `think`: Thinking-intensive tasks (Plan Mode)
  - `longContext`: Long context (exceeds `longContextThreshold` tokens)
  - `webSearch`: Web search tasks

Token calculation uses `tiktoken` (cl100k_base) to estimate request size.

### 2. Transformer System

The `@musistudio/llms` package (`packages/core/`) handles request/response transformations. Transformers adapt to different provider API differences:

- Built-in transformers:
  - Provider adapters: `anthropic`, `deepseek`, `gemini`, `groq`, `openrouter`, `openai`, `openai.responses`, `cerebras`, `antigravity`, `vercel`, `vertex-claude`, `vertex-gemini`
  - Request/response modifiers: `maxtoken`, `maxcompletiontokens`, `sampling`, `customparams`, `cleancache`, `streamoptions`
  - Tool handling: `tooluse`, `enhancetool`
  - Reasoning: `reasoning`, `forcereasoning`
- Custom transformers: Load external plugins via `transformers` array in `config.json`

Transformer configuration supports:
- Global application (provider level)
- Model-specific application
- Option passing (e.g., `max_tokens` parameter for `maxtoken`)

### 3. Agent System (packages/server/src/agents/)

Agents are pluggable feature modules that can:
- Detect whether to handle a request (`shouldHandle`)
- Modify requests (`reqHandler`)
- Handle responses (`resHandler`, optional)
- Provide custom tools (`tools`)

Built-in agents:
- **imageAgent**: Handles image-related tasks

Agent tool call flow:
1. Detect and mark agents in `preHandler` hook
2. Add agent tools to the request
3. Intercept tool call events in `onSend` hook
4. Execute agent tool and initiate new LLM request
5. Stream results back

### 4. SSE Stream Processing

The server uses custom Transform streams to handle Server-Sent Events:
- `SSEParserTransform`: Parses SSE text stream into event objects
- `SSESerializerTransform`: Serializes event objects into SSE text stream
- `rewriteStream`: Intercepts and modifies stream data (for agent tool calls)

### 5. OAuth Authentication System (packages/shared/src/auth/)

OAuth support allows providers to authenticate via subscription-based services instead of static API keys.

**Architecture:**
- Token store: `~/.claude-code-router/auth.json` (file permissions `0600`)
- Token schema: discriminated union — `{ type: "oauth", access, refresh, expires }` or `{ type: "api", key }`
- Dynamic token resolution: `LLMProvider.getApiKey?: () => Promise<string>` — called at request time, auto-refreshes expired tokens
- Dynamic extra headers: `LLMProvider.getExtraHeaders?: () => Promise<Record<string, string>>` — injects provider-specific headers (e.g., `chatgpt-account-id` for Codex)

**OAuth Flows:**
- `packages/shared/src/auth/oauth/deviceCode.ts` — Device Code Flow (RFC 8628) for GitHub Copilot
- `packages/shared/src/auth/oauth/authorizationCode.ts` — Authorization Code + PKCE for Codex, Anthropic, Gemini, Antigravity

**Built-in OAuth Providers** (`packages/shared/src/auth/providers/`):

| Provider | Flow | Port | Notes |
|----------|------|------|-------|
| `copilot` | Device Code | N/A | GitHub Copilot, no local server needed |
| `anthropic` | Auth Code + PKCE | 3000 | Claude Pro/Max subscription, ToS risk |
| `antigravity` | Google OAuth | 51121 | Google OAuth, requires `client_secret` |
| `codex` | Auth Code + PKCE | 1455 | ChatGPT Plus/Pro, custom callback path `/auth/callback` |
| `gemini` | Google OAuth | 8088 | Google OAuth, requires `client_secret`, callback `/oauth2callback` |

**Server-side OAuth endpoints** (`packages/server/src/server.ts`):
- `GET /api/auth/providers` — list available OAuth providers and their status
- `POST /api/auth/login/:provider` — start OAuth login flow
- `POST /api/auth/logout/:provider` — remove stored tokens
- `GET /api/auth/status/:provider` — individual provider token status
- `GET /api/auth/models/:provider` — fetch available models for an OAuth provider

**Provider pipeline** (`packages/server/src/index.ts`):
- `oauthTokenResolvers` map wires each OAuth provider to its `getAccessToken` function
- `oauthExtraHeadersResolvers` map wires provider-specific HTTP headers (e.g., Codex `chatgpt-account-id`)
- Provider registration skips `api_key` requirement when `auth_type: "oauth"` is set

**Config schema for OAuth providers:**
```json
{
  "name": "copilot",
  "api_base_url": "https://api.githubcopilot.com",
  "auth_type": "oauth",
  "oauth_provider": "copilot",
  "models": ["claude-opus-4-6", "gpt-5.2-codex", "gpt-4.1", "claude-haiku-4.5", "gpt-5-mini", "gpt-4o"]
}
```

### 6. Configuration Management

Configuration file location: `~/.claude-code-router/config.json`

Key features:
- Supports environment variable interpolation (`$VAR_NAME` or `${VAR_NAME}`)
- JSON5 format (supports comments)
- Automatic backups (keeps last 3 backups)
- Hot reload requires service restart (`ccr restart`)

Configuration validation:
- If `Providers` are configured with `APIKEY`, listens on configured host (default `0.0.0.0`)
- If `Providers` are configured without `APIKEY`, restricts to `127.0.0.1` (local-only access)
- If no `Providers` are configured, listens on `0.0.0.0` without authentication
- OAuth providers use `auth_type: "oauth"` + `oauth_provider` instead of `api_key`

### 7. Logging System

Two separate logging systems:

**Server-level logs** (pino):
- Location: `~/.claude-code-router/logs/ccr-*.log`
- Content: HTTP requests, API calls, server events
- Configuration: `LOG_LEVEL` (fatal/error/warn/info/debug/trace)

**Application-level logs**:
- Location: `~/.claude-code-router/claude-code-router.log`
- Content: Routing decisions, business logic events

## CLI Commands

```bash
ccr start      # Start server
ccr stop       # Stop server
ccr restart    # Restart server
ccr status     # Show status
ccr code       # Execute claude command
ccr model      # Interactive model selection and configuration
ccr preset     # Manage presets (export, install, list, info, delete)
ccr activate   # Output shell environment variables (for integration) (alias: env)
ccr install    # Install preset from GitHub marketplace
ccr ui         # Open Web UI
ccr statusline # Integrated statusline (reads JSON from stdin)
ccr auth       # OAuth authentication management
```

### Auth Commands

```bash
ccr auth login <provider>     # Start OAuth login (copilot, anthropic, antigravity, codex, gemini)
ccr auth logout <provider>    # Remove stored tokens
ccr auth list                 # List all stored authentications
ccr auth status [provider]    # Show authentication status
```

### Preset Commands

```bash
ccr preset export <name>      # Export current configuration as a preset
ccr preset install <source>   # Install a preset from file, URL, or name
ccr preset list               # List all installed presets
ccr preset info <name>        # Show preset information
ccr preset delete <name>      # Delete a preset (aliases: rm, remove)
```

## Subagent Routing

Use special tags in subagent prompts to specify models:
```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Preset System

Presets allow users to save, share, and reuse configurations. Stored in `~/.claude-code-router/presets/<preset-name>/manifest.json`.

- Core logic: `packages/shared/src/preset/` (export, install, merge, sensitive field sanitization)
- CLI layer: `packages/cli/src/utils/preset/` (user interaction, file ops, display)
- Export automatically sanitizes sensitive data (api_key fields become `{{field}}` placeholders)
- Install supports conflict strategies: ask, overwrite, merge, skip

## Dependencies

```
cli    → server, shared
server → core (@musistudio/llms), shared
core   → shared
ui     (standalone frontend application)
docs   (standalone documentation site)
```

All inter-package dependencies use `workspace:*` protocol.

## Development Notes

1. **Node.js version**: Requires >= 20.0.0
2. **Package manager**: Uses pnpm >= 8.0.0 (monorepo depends on workspace protocol)
3. **TypeScript**: All packages use TypeScript; UI and core packages are ESM modules
4. **Build tools**:
   - cli/server/shared: esbuild
   - core: custom build script (tsx)
   - ui: Vite + TypeScript
   - docs: Docusaurus
5. **@musistudio/llms**: This is a workspace package at `packages/core/`, providing the core server framework (Fastify), transformer functionality, and provider adapters. Type definitions in `packages/server/src/types.d.ts`
6. **Code comments**: All comments in code MUST be written in English
7. **Documentation**: When implementing new features, add documentation to the docs project instead of creating standalone md files

## Configuration Example Locations

- Main configuration example: Complete example in README.md
- Custom router example: `custom-router.example.js`
