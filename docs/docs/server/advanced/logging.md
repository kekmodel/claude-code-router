---
sidebar_position: 5
---

# Logging

Claude Code Router uses two separate logging systems for different purposes.

## Server-level Logs (pino)

HTTP request/response logs powered by [pino](https://github.com/pinojs/pino) via Fastify.

**Location:** `~/.claude-code-router/logs/ccr-*.log`

**Content:** HTTP requests, API calls, server events, routing decisions.

**Log rotation:**
- New file created per second (timestamped: `ccr-YYYYMMDDHHmmss.log`)
- Maximum 3 log files retained
- Rotated daily
- Maximum 50MB per file

### Configuration

In `config.json`:

```json
{
  "LOG": true,
  "LOG_LEVEL": "debug"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `LOG` | boolean | `true` | Enable or disable server logging |
| `LOG_LEVEL` | string | `"debug"` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

Set `LOG` to `false` to disable server-level logging entirely.

## Application-level Logs

Business logic logs for routing decisions and application events.

**Location:** `~/.claude-code-router/logs/app.log`

This log file is configured via the `LOG_FILE` internal setting and captures higher-level application events separate from raw HTTP traffic.

## Viewing Logs

### CLI

Server logs are stored as files in `~/.claude-code-router/logs/`.

### Web UI

The Web UI dashboard includes a **Log Viewer** button that displays recent server logs directly in the browser.

### API

The server exposes a log API endpoint:

```
GET /api/logs
```

See the [Logs API reference](/docs/server/api/logs-api) for details.
