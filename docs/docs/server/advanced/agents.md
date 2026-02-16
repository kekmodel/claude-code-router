---
sidebar_position: 3
---

# Agent System

Agents are pluggable feature modules that extend the server with custom capabilities. They can intercept requests, inject tools, and process responses.

## How Agents Work

```
Request → preHandler hook → Agent detection → Tool injection → LLM call
                                                                  ↓
Response ← Stream back ← Agent tool execution ← onSend hook ← Tool call event
```

1. **Detection**: In the `preHandler` hook, each agent's `shouldHandle` method is called to determine if it should process the request
2. **Request modification**: `reqHandler` modifies the request (e.g., injects system prompts, caches images)
3. **Tool injection**: Agent tools are added to the request's tool list
4. **Interception**: In the `onSend` hook, SSE stream events are monitored for tool calls
5. **Execution**: When a tool call is detected, the agent executes its handler and sends the result back to the LLM

## Agent Interface

```typescript
interface IAgent {
  name: string;
  tools: Map<string, ITool>;
  shouldHandle: (req: any, config: any) => boolean;
  reqHandler: (req: any, config: any) => void;
  resHandler?: (payload: any, config: any) => void; // optional
}

interface ITool {
  name: string;
  description: string;
  input_schema: any;
  handler: (args: any, context: any) => Promise<string>;
}
```

### Methods

| Method | Required | Description |
|--------|----------|-------------|
| `shouldHandle` | Yes | Returns `true` if this agent should handle the current request |
| `reqHandler` | Yes | Modifies the request before it's sent to the LLM |
| `resHandler` | No | Processes the response payload |
| `tools` | Yes | Map of tool name → tool definition with handler |

## Built-in Agents

### imageAgent

Enables image analysis for models that don't natively support vision. When a request contains images but is routed to a text-only model, the image agent:

1. Detects image content in messages
2. Caches images in an LRU cache (max 100 entries, 5-minute TTL)
3. Replaces images with text placeholders (`[Image #1]`)
4. Injects an `analyzeImage` tool into the request
5. When the model calls `analyzeImage`, routes the image to a vision-capable model (configured via `Router.image`)

**Configuration:**

Set `Router.image` in `config.json` to specify the vision-capable model:

```json
{
  "Router": {
    "image": "gemini,gemini-2.5-flash"
  }
}
```

## Registering Agents

Agents are registered in `packages/server/src/agents/index.ts`:

```typescript
import { AgentsManager } from './index';

const agentsManager = new AgentsManager();
agentsManager.registerAgent(imageAgent);
```

The `AgentsManager` provides:
- `registerAgent(agent)` — register an agent
- `getAgent(name)` — find agent by name
- `getAllAgents()` — get all registered agents
- `getAllTools()` — get all tools from all agents
