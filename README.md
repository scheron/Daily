# <img src="./src/renderer/public/favicon.svg" width="25" height="25" /> Daily

Daily is a local-first, day-centric task manager for macOS with a built-in AI assistant that executes real operations instead of just answering questions.

Tasks are organized by date rather than in endless lists, live on a three-column Kanban board, and are written in full Markdown. All data is stored in SQLite on your Mac; iCloud sync is optional. The AI assistant runs an agent loop over the same task operations the UI uses — with local models that run entirely in-app with zero extra setup, or optionally any OpenAI-compatible remote API.

[![Latest release](https://img.shields.io/github/v/release/scheron/Daily?label=release)](https://github.com/scheron/Daily/releases)
[![Downloads](https://img.shields.io/github/downloads/scheron/Daily/total)](https://github.com/scheron/Daily/releases)
[![License](https://img.shields.io/github/license/scheron/Daily)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-black)](https://github.com/scheron/Daily/releases)

![Daily Desktop](./media/ui.png)

## Install

Install with Homebrew:

```bash
brew install --cask scheron/tap/daily
```

Or install manually:

1. Open [Releases](https://github.com/scheron/Daily/releases/latest)
2. Download the macOS `.dmg` (Apple Silicon)
3. Move **Daily.app** to **Applications**

The app checks GitHub Releases and updates itself in place, so you only download once.

Builds are ad-hoc signed, not notarized. If macOS blocks the first launch, run:

```bash
xattr -rd com.apple.quarantine /Applications/Daily.app
```

## CLI

The app bundle includes a `daily` command-line launcher. Homebrew installs it into
your `PATH`; manual `.dmg` installs can enable it from **Settings → General →
Command Line**.

```bash
daily tasks
daily tasks add "Review PR"
daily task <id-or-prefix>
daily tags
daily projects
```

## What Daily is for

- planning around a single question: what did I do yesterday, and what matters today
- moving tasks through a board (active / discarded / done) instead of maintaining lists
- writing task content in real Markdown with code, tables, and attachments
- keeping separate task spaces per project and switching between them instantly
- tracking where the time goes — estimates, time spent, and activity stats per day
- delegating routine task operations to an AI assistant that acts, not chats
- owning the data: plain SQLite on disk, no account, no mandatory cloud

## Core ideas

### Day-first workflow

Every task belongs to a date. The calendar is the primary navigation surface and shows at a glance which days carry open work; tasks reschedule via drag-and-drop onto a date.

### Local-first storage

SQLite on your Mac is the single source of truth. The app is fully functional offline. Sync, when enabled, treats iCloud as a transport — never as the primary store.

### Action over chat

The assistant executes the same operations the UI exposes: creating and editing tasks, changing statuses, managing tags and time, searching by date, summarizing the day. Destructive operations always suspend and ask for explicit confirmation before running.

## Feature overview

### Board and task editor

- three-column Kanban board (active / discarded / done) with drag-and-drop reordering and cross-status moves
- a resizable slide-in editor with property rows: status, date, project, estimate, time spent, tags
- prev/next navigation between tasks without leaving the editor
- quick task actions: duplicate, copy ID or content, delete
- unsaved changes are guarded with a save/discard prompt

### Markdown editor

The editor is CodeMirror-based with live-preview behavior:

- syntax highlighting for fenced code blocks, with a copy button and auto-closing fences
- Markdown tables render as live, click-to-edit tables
- slash commands for inserting headings, lists, quotes, checkboxes, and other blocks
- wrapped list items keep a hanging indent; ordered lists renumber automatically
- file and image attachments, stored as regular files on disk
- inline tag commands (`#tag`, `-#tag`) with autocomplete

### Projects

Projects (branches) isolate task spaces, with instant switching, inline project creation, and task moves between projects. Search resolves matches across all projects and switches context automatically.

### Activity history

Every meaningful task change — created, completed, discarded, reactivated, edited, moved, restored, deleted — is recorded in an append-only event log that syncs across devices.

- the Activity widget shows a day-by-day feed of what changed
- same-day restore for deleted tasks, directly from the feed
- a per-task timeline of every change

Soft-deleted items past the retention window are cleaned up automatically on app start.

### Search

Fuzzy full-text search across all tasks: tolerates typos, matches on content, and jumps directly to the task's date (switching project if needed).

### Stats

Per-day and per-period statistics are computed in SQL and rendered in the sidebar widget: a resolution ring, a tag-composition ring, weekday and hour histograms, and peak hour / peak weekday / top tag for the period, with a week/month toggle.

### Appearance

- light, dark, or follow-the-system mode with 9 accent color presets
- configurable sidebar widgets (calendar, stats, activity) with drag-to-reorder

### iCloud sync

Sync is off by default and optional. When enabled, Daily syncs snapshots through iCloud Drive with last-write-wins merge and a periodic auto-sync. iCloud placeholder files are recognized and downloaded before being treated as data. The app never requires an account or a server.

## AI assistant

The assistant is not a chat bolted onto the app — it is a full agent with tool calling. It runs in its own window and operates on the workspace through the same storage layer as the UI: task CRUD, status updates, date-based search, batch actions, tag/time/attachment management, and day summaries.

<p align="center">
  <img src="./media/ai.png" width="520" alt="AI Assistant window" />
</p>

How it works:

- each message runs an agent loop: the model calls tools, observes results, and iterates until done
- responses stream live, with model reasoning shown in a collapsible timed panel
- destructive tool calls suspend until explicitly confirmed in the UI
- conversations persist across app restarts; long histories are compacted automatically
- a live indicator tracks how full the model's context window is
- the assistant can read web pages on request: private/internal addresses are blocked, fetched content is treated as untrusted, and the first fetch asks for permission

Typical prompts:

- "Create a task to review the PR tomorrow at 2pm"
- "I spent 2 hours on the documentation task"
- "Complete all my work tasks for today"
- "How's my day going?"

### Models

Both local and remote models are supported, switchable from the same settings screen — and both run the full agent loop.

**Local** — zero-setup and fully offline. No Ollama, LM Studio, or command line required: models are downloaded from a curated in-app catalog and are ready to use immediately — Daily manages its own llama.cpp server with Metal acceleration under the hood. The catalog includes the Qwen3.5 family, GLM-4 9B, Mistral Nemo 12B, and Llama 3.1 8B. Downloads are resumable and sha256-verified; idle models unload automatically to free memory (configurable, 15 minutes by default).

**Remote** — any OpenAI-compatible API with your key. Presets for OpenAI and DeepSeek models, or a custom base URL. Models without native function calling (Qwen 3.5-style fine-tunes) are supported through a compatibility mode.

## Data storage and privacy

- all data is stored locally in SQLite
- attachments are regular files on disk, tracked by the database
- no account, no telemetry, no mandatory cloud dependency
- deletes are soft: records are tombstoned, recoverable same-day, and purged after a retention window
- with sync enabled, data leaves the machine only as snapshots in your own iCloud Drive

## Platform support

macOS (Apple Silicon) only. Electron would allow Windows/Linux builds, but they are not shipped due to limited testing coverage (or I'm just lazy 🤷‍♂️).

## License

[MIT](./LICENSE)
