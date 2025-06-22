# <img src="./src/renderer/public/favicon.svg" width="25" height="25" /> Daily 

**Daily** — A task management application focused on productivity, minimalism, and convenience. ✨


 ![Desktop Demo](./media/Demo.png) 

---

### Idea 🤔

The idea came from my habit of organizing daily tasks in markdown, like:

```md
## Monday, Dec 16

- [x] Review pull requests  
- [x] Team standup meeting
- [ ] Complete feature implementation

## Tuesday, Dec 17

- [x] Deploy to staging
- [ ] Write documentation
- [ ] Plan next sprint
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

1. Go to [Releases](https://github.com/scheron/Daily/releases)
2. Download the appropriate version for your system:
   - macOS: `.dmg`
   - Windows: `.exe`
   - Linux: `.AppImage`

> [!NOTE]
> The app is currently **not signed or notarized**:
> - **macOS** will show a Gatekeeper warning. Follow the terminal instructions below to remove quarantine.
> - **Windows** will display a "Windows protected your PC" warning. Click "More info" → "Run anyway".
>
> This is intentional, as Daily is open-source and not distributed through centralized stores.  
> You can verify all binaries are built from source on GitHub.

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

### 🖥️ Windows

- Run the `.exe` installer
- Click "More info" → "Run anyway" if prompted

---

### 🐧 Linux

You can either:

- Make the AppImage executable:
  ```bash
  chmod +x Daily-*.AppImage
  ./Daily-*.AppImage
  ```

Or quick install via terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/install-linux.sh | sh
```

---

## 🔄 Updating

If installed via terminal script, update using:

### macOS

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/update-mac.sh | sh
```

### Linux

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/scripts/install/update-linux.sh | sh
```

Or just download the latest version from the [Releases](https://github.com/scheron/Daily/releases) page.

---

Enjoy using **Daily** — your tasks, your days. ☀️