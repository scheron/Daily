# <img src="./src/renderer/public/favicon.svg" width="25" height="25" /> Daily 

**Daily** — A task management application focused on productivity, minimalism, and convenience. ✨


 ![Desktop Demo](./media/Demo-new.png) 

---

### Idea 🤔

The idea came from my habit of organizing daily tasks in markdown, like:

```md
## Tuesday, Dec 17

- [x] Deploy to staging
- [ ] Write documentation
- [ ] Plan next sprint

## Monday, Dec 16

- [x] Review pull requests  
- [x] Team standup meeting
- [ ] Complete feature implementation

```

I typically maintain my tasks organized by days, which allows me to revisit and track progress later.

This stems from the standard workflow requirement: "What I did yesterday, what I'm doing today" 📊

No bloat. No accounts. No cloud.
Just a lightweight, local tool to help me stay on track, one day at a time.

---

### ✨ Features

- **Day-centric workflow** — organize tasks by date
- **Calendar navigation** 📅 — jump to any day
- **Task management** ✅ — add, edit, complete tasks
- **Time tracking** ⏱️ — estimate task duration and track time with a built-in timer
- **Dedicated timer window** 🪟 — focus with a convenient separate timer interface
- **Quick retrospectives** — see yesterday, plan today
- **Tags** 🏷️ — group tasks by project or context
- **Markdown support** 📝 — rich formatting with keyboard
- **Obsidian-like storage** 📁 — local storage in markdown format with individual task files
- **Multiple themes** 🎨 — choose from 9+ UI themes

---

## 📁 Task Storage

Daily uses an **Obsidian-like storage system** that keeps tasks as individual markdown files, making them easy to sync, backup, and access from anywhere.

### File Structure

```
Documents/
└── Daily/
    ├── 2024-01-15/
    │   ├── task_abc123.md
    │   └── task_def456.md
    ├── 2024-01-16/
    │   └── task_ghi789.md
    ├── .meta.json
    ├── .config.json
    └── assets/          # Attached files (images, documents, etc.)
```

### Task Files

Each task is stored as a separate `.md` file with YAML frontmatter containing metadata:

```markdown
---
id: task_abc123
date: 2024-01-15
status: done
estimated: 4 h. 30 min.
spent: 1 h.
tags: [work, project]
---

Complete the feature implementation and write documentation
```

### Assets

The `assets/` folder stores any files attached to your tasks (images, documents, etc.). When you attach a file to a task, it's automatically copied to this folder with a unique filename, ensuring your attachments stay organized and accessible.

### Benefits

- **🔄 Easy Sync** — Works with any cloud service (Dropbox, iCloud, Google Drive)
- **📝 Human Readable** — Tasks are plain markdown files you can edit manually
- **🔒 Local First** — Your data stays on your device, no cloud required
- **📦 Portable** — Copy the entire folder to backup or move between devices
- **🔍 Version Control** — Perfect for Git repositories to track changes over time
- **🛠️ Interoperable** — Use with other markdown editors or tools

---

### 🗺️ Planned

- **AI-powered search** 🔍 — search across tasks intelligently
- **Voice-to-task** 🎤 — jot down ideas while walking

---

## 🚀 Installation

> [!NOTE]
> **macOS Only**: Daily currently supports only macOS. While built with Electron (which supports cross-platform deployment), this is a personal project and I don't have Windows or Linux systems available for proper testing and support (or I'm just lazy 🤷‍♂️).

1. Go to [Releases](https://github.com/scheron/Daily/releases)
2. Download the `.dmg` file for macOS

> [!NOTE]
> The app is currently **not signed or notarized**:
> - **macOS** will show a Gatekeeper warning. Follow the terminal instructions below to remove quarantine.
>
> This is intentional, as Daily is open-source and not distributed through centralized stores.  

---

### 💻 macOS

You can either:

- Open the downloaded `.dmg`
- Drag **Daily.app** to **Applications**
- Run this in terminal:
  ```bash
  xattr -rd com.apple.quarantine /Applications/Daily.app
  ```

Or quick install via terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/install-mac.sh | sh
```

---

## 🔄 Updating

If installed via terminal script, update using:

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/update-mac.sh | sh
```

Or just download the latest version from the [Releases](https://github.com/scheron/Daily/releases) page.

---

Enjoy using **Daily** — your tasks, your days. ☀️