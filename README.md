# <img src="./src/renderer/public/favicon.svg" width="25" height="25" /> Daily

**Daily** is an AI-powered task manager focused on productivity, minimalism, aesthetics, and day-to-day planning.

![Daily Desktop](./media/Demo-super-new.png)

---

## Overview

Daily is built around a simple question:
**What did I do yesterday, and what matters today?**

It combines day-based planning, fast task operations, and an execution-focused AI assistant in a local-first app for macOS.

## Core Principles

- **Day-first workflow**: tasks are organized by date, not buried in endless lists.
- **Local-first architecture**: your data stays on your Mac and works offline.
- **Action over chat**: AI is built to execute operations, not just answer questions.

---

## Features

### Plan your day

#### Tasks are grouped by day, with fast date switching, month navigation (wheel/swipe), and keyboard-driven flow.

![Managing Tasks](./media/showcase/tasks-managment.gif)

### Organize work visually

#### Use both **List** and **Board** layouts. Empty columns can be hidden/collapsed, and tasks can be moved or reordered.

![List and Board Layouts](./media/columns-view.png)

#### Context menu provides quick task actions without leaving the current view.

![Task Context Menu](./media/context-menu.png)

#### Projects/branches let you isolate task spaces. Switch branch in header, manage projects in Settings, move tasks across projects, and navigate from search with automatic branch switch.

![Projects and Branches](./media/showcase/branch-demo.gif)

#### Tasks can be rescheduled to another day in a few steps.

![Move Tasks](./media/showcase/move-tasks.gif)

### Capture rich task details

#### Task content supports markdown, file/image attachments, and tag-based organization.

![Tag Management](./media/showcase/tags-managment.gif)

#### Inline commands work in-editor: `#tag` adds, `-#tag` removes, with autocomplete.

![Inline Tag Commands](./media/tags-predict.png)

### Find and recover quickly

#### Fuzzy search scans all tasks, tolerates typos, and jumps directly to the target date.

![Search Tasks](./media/showcase/search.gif)

#### Deleted tasks can be restored or permanently removed.

![Delete Restore](./media/showcase/delete-restore.gif)

### Stay local, sync when needed

iCloud sync is optional. The app remains local-first and fully usable offline.
![Sync](./media/showcase/sync.gif)

UI customization includes 9+ themes, including Glass UI.
![Glass UI Demo](./media/glass-ui-demo.png)

---

## AI Assistant

Daily includes an in-app AI assistant that executes real operations in your workspace.

![AI Assistant](./media/showcase/ai-assistant-demo.gif)

### What it can do

The assistant performs real in-app operations: task CRUD, status updates, date-based search, batch actions, tag/time/attachment management, and day summaries.

### Typical prompts

- "Create a task to review the PR tomorrow at 2pm"
- "I spent 2 hours on the documentation task"
- "Complete all my work tasks for today"
- "How's my day going?"

### Model options

Both runtime modes are supported: local models and remote API models.

| Local models                                           | Remote models (OpenAI-compatible)                        |
| ------------------------------------------------------ | -------------------------------------------------------- |
| ![Local Model Settings](./media/ai-settings-local.png) | ![Remote Model Settings](./media/ai-settings-remote.png) |
| Run fully offline with llama.cpp                       | Use cloud models with your API key                       |
| Metal acceleration on macOS                            | No local model download required                         |
| Three curated local profiles: fast, balanced, quality  | Access latest hosted models                              |

---

## Privacy and Data Control

Daily stores data locally on your Mac by default.

- No account required
- No mandatory cloud dependency
- Works offline
- Optional iCloud sync
- Local-first storage with data integrity safeguards

---

## Platform Support

> [!NOTE]
> **macOS Only**: Daily currently supports only macOS. While Electron supports cross-platform deployment, Windows/Linux builds are not officially supported yet due to limited testing coverage.(or I'm just lazy 🤷‍♂️).

---

## Installation

1. Open [Releases](https://github.com/scheron/Daily/releases)
2. Download the latest macOS `.dmg`
3. Move **Daily.app** to **Applications**

If macOS blocks launch because the app is not notarized, run:

```bash
xattr -rd com.apple.quarantine /Applications/Daily.app
```

Quick install (optional):

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/install-mac.sh | sh
```

> [!WARNING]
> `curl | sh` executes a remote script. Prefer the Releases package when possible, or review the script first.

---

## Updating

If installed via script, update with:

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/update-mac.sh | sh
```

Or download the latest release manually from [Releases](https://github.com/scheron/Daily/releases).
