# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Image Forge — a local mobile-first image generation app. A Node.js server runs on the computer, serving a web UI that phones access over LAN. The backend calls an OpenAI-compatible image API. All user-facing strings are in Chinese (zh-CN).

## Commands

```bash
npm install          # Install dependencies (none required)
npm start            # Start server on http://localhost:4173 (or PORT env var)
npm run dev          # Same as start (no hot reload)
```

No build step, no linting, no test framework configured. Zero external dependencies.

## Architecture

**Backend** (`server.js`): Single-file `node:http` server handling API routes (`/api/*`) and static file serving from `public/`. No Express or other framework.

**Frontend** (`public/`): Vanilla HTML/CSS/JS SPA with 5 tabs — Create, Presets (灵感), Tasks (任务), History (历史), Settings (设置). Mobile-first design (max-width 560px, bottom tab nav, safe-area insets).

**Async job queue**: `POST /api/generate` creates a job → stored in `Map` + persisted to `data/jobs.json` → runs async via `setTimeout` → frontend polls `GET /api/jobs/:id` every 1.8s → results saved to `public/generated/` and appended to `data/history.json`.

**Data persistence**: JSON file reads/writes with serialized promise queues (`historySaveQueue`, `jobsSaveQueue`) to prevent write conflicts. History capped at 100 entries, jobs at 200.

## Key API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/settings` | Get current configuration |
| PUT | `/api/settings` | Update configuration |
| POST | `/api/generate` | Submit image generation job |
| GET | `/api/jobs/:id` | Poll job status |
| DELETE | `/api/jobs/:id` | Cancel/delete job |
| GET | `/api/history` | List generation history |
| GET | `/api/templates` | List ecommerce templates |
| GET | `/api/presets` | List prompt presets |
| GET | `/api/debug/recent` | Recent API call debug log |

## Configuration

All settings are stored in `data/settings.json` (gitignored) and configurable via the Settings page:

- `apiBaseUrl` — API endpoint URL
- `apiKey` — API authentication key
- `imageModel` — Model name
- `imageRequestTimeoutMs` — Request timeout (default 600000)
- `imageDownloadTimeoutMs` — Download timeout (default 90000)
- `imageRequestMaxAttempts` — Max retry attempts (default 4)
- `maxCompareCount` — Max images per generation (default 4)

## Key Directories

- `public/generated/` — Output images (gitignored)
- `data/` — Persistent state: `history.json`, `jobs.json`, `settings.json` (gitignored)
- `references/` — Template and preset JSON data (committed)

## Important Notes

- **ESM modules**: `"type": "module"` in package.json — use `import`/`export`, not `require`
- **No framework**: Both frontend and backend are vanilla JS. No React, Vue, Express, TypeScript.
- **API key**: Stored in `data/settings.json` (gitignored), configurable via Settings page
- **Language**: All UI text, strategy profiles, template names, and presets are in Chinese
