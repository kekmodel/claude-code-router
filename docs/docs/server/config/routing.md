---
sidebar_position: 3
---

# Routing Configuration

Configure how requests are routed to different models.

## Default Routing

Set the default model for all requests:

```json
{
  "Router": {
    "default": "codex,gpt-5.3-codex"
  }
}
```

## Built-in Scenarios

### Background Tasks

Route background tasks to a lightweight model:

```json
{
  "Router": {
    "background": "copilot,gpt-5-mini"
  }
}
```

### Thinking Mode (Plan Mode)

Route thinking-intensive tasks to a more capable model:

```json
{
  "Router": {
    "think": "codex,gpt-5.3-codex"
  }
}
```

### Long Context

Route requests with long context:

```json
{
  "Router": {
    "longContextThreshold": 60000,
    "longContext": "gemini,gemini-3-pro-preview"
  }
}
```

### Web Search

Route web search tasks:

```json
{
  "Router": {
    "webSearch": "copilot,gpt-5-mini"
  }
}
```

### Image Tasks

Route image-related tasks to a vision-capable model (handled by Agent System):

```json
{
  "Router": {
    "image": "gemini,gemini-3-flash-preview"
  }
}
```

## Fallback

When a request fails, you can configure a list of backup models. The system will try each model in sequence until one succeeds:

### Basic Configuration

```json
{
  "Router": {
    "default": "codex,gpt-5.3-codex",
    "background": "copilot,gpt-5-mini",
    "think": "antigravity,antigravity-claude-opus-4-6-thinking",
    "longContext": "gemini,gemini-3-pro-preview",
    "longContextThreshold": 60000,
    "webSearch": "copilot,gpt-5-mini"
  },
  "fallback": {
    "default": [
      "antigravity,antigravity-gemini-3-pro",
      "copilot,gpt-4.1"
    ],
    "background": [
      "copilot,gpt-4o-mini"
    ],
    "think": [
      "codex,gpt-5.3-codex",
      "copilot,claude-opus-4-6"
    ],
    "longContext": [
      "antigravity,antigravity-gemini-3-pro"
    ],
    "webSearch": [
      "copilot,gpt-4o"
    ]
  }
}
```

### How It Works

1. **Trigger**: When a model request fails for a routing scenario (HTTP error response)
2. **Auto-switch**: The system automatically checks the fallback configuration for that scenario
3. **Sequential retry**: Tries each backup model in order
4. **Success**: Once a model responds successfully, returns immediately
5. **All failed**: If all backup models fail, returns the original error

### Configuration Details

- **Format**: Each backup model format is `provider,model`
- **Validation**: Backup models must exist in the `Providers` configuration
- **Flexibility**: Different scenarios can have different fallback lists
- **Optional**: If a scenario doesn't need fallback, omit it or use an empty array

### Use Cases

#### Scenario 1: Primary Model Quota Exhausted

```json
{
  "Router": {
    "default": "codex,gpt-5.3-codex"
  },
  "fallback": {
    "default": [
      "antigravity,antigravity-gemini-3-pro",
      "copilot,gpt-4.1"
    ]
  }
}
```

Automatically switches to backup models when the primary model quota is exhausted.

#### Scenario 2: Service Reliability

```json
{
  "Router": {
    "background": "copilot,gpt-5-mini"
  },
  "fallback": {
    "background": [
      "gemini,gemini-3-flash-preview",
      "copilot,gpt-4o-mini"
    ]
  }
}
```

Automatically switches to other providers when the primary service fails.

### Log Monitoring

The system logs detailed fallback process:

```
[warn] Request failed for default, trying 2 fallback models
[info] Trying fallback model: antigravity,antigravity-gemini-3-pro
[warn] Fallback model antigravity,antigravity-gemini-3-pro failed: API rate limit exceeded
[info] Trying fallback model: copilot,gpt-4.1
[info] Fallback model copilot,gpt-4.1 succeeded
```

### Important Notes

1. **Cost consideration**: Backup models may incur different costs, configure appropriately
2. **Performance differences**: Different models may have varying response speeds and quality
3. **Quota management**: Ensure backup models have sufficient quotas
4. **Testing**: Regularly test the availability of backup models

## Project-Level Routing

Configure routing per project in `~/.claude/projects/<project-id>/claude-code-router.json`:

```json
{
  "Router": {
    "default": "copilot,gpt-4.1"
  }
}
```

Project-level configuration takes precedence over global configuration.

## Custom Router

Create a custom JavaScript router function:

1. Create a router file (e.g., `custom-router.js`):

```javascript
module.exports = function(config, context) {
  // Analyze the request context
  const { scenario, projectId, tokenCount } = context;

  // Custom routing logic
  if (scenario === 'background') {
    return 'copilot,gpt-5-mini';
  }

  if (tokenCount > 100000) {
    return 'gemini,gemini-3-pro-preview';
  }

  // Default
  return 'codex,gpt-5.3-codex';
};
```

2. Set the `CUSTOM_ROUTER_PATH` environment variable:

```bash
export CUSTOM_ROUTER_PATH="/path/to/custom-router.js"
```

## Token Counting

The router uses `tiktoken` (cl100k_base) to estimate request token count. This is used for:

- Determining if a request exceeds `longContextThreshold`
- Custom routing logic based on token count

## Subagent Routing

Specify models for subagents using special tags:

```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Next Steps

- [Transformers](/docs/server/config/transformers) - Apply transformations to requests
- [Custom Router](/docs/server/advanced/custom-router) - Advanced custom routing
