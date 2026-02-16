---
sidebar_position: 4
---

# Web UI

Claude Code Router includes a web-based management interface for visual configuration and monitoring.

## Opening the Web UI

```bash
ccr ui
```

This opens the Web UI in your default browser. The UI connects to the running CCR server.

## Pages

### Dashboard (`/dashboard`)

The main page with tabs for:

- **Providers** — View and configure LLM providers
- **Transformers** — Manage request/response transformers per provider
- **Router** — Configure routing rules (default, background, think, longContext, webSearch, image)

Additional features accessible from the dashboard header:
- **Settings** — Server settings dialog
- **JSON Editor** — Edit `config.json` directly
- **Log Viewer** — View server logs
- **Save** — Save current configuration
- **Restart** — Restart the server

### Presets (`/presets`)

Browse, install, and manage configuration presets. Supports dynamic configuration forms for preset parameters.

### OAuth Management (`/oauth`)

Manage OAuth authentication for subscription-based providers:
- View authentication status for each provider
- Start login flows directly from the browser
- Logout from providers

### Debug (`/debug`)

Development debugging page.

## Authentication

The Web UI requires authentication when `APIKEY` is configured in `config.json`. The login page prompts for the API key before granting access.

If no `APIKEY` is configured and the server is restricted to localhost, no authentication is needed.

## Tech Stack

- **React** with React Router
- **Tailwind CSS** for styling
- **Radix UI** for accessible components
- **Vite** for development and bundling
- **i18n** support for internationalization
