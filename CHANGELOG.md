# Changelog

## v0.3.3 - 2025-06-26

### 🏗️ Architecture Refactoring
- **Major storage architecture refactoring** - Complete overhaul of the storage system with new modular architecture
- Streamlined storage migration process with consolidated migration logic
- Enhanced asset and config handling capabilities

### 🔧 Code Organization Improvements  
- Reorganized main process structure for better maintainability:
  - Moved core functionality to dedicated `core/` directory
  - Split IPC handlers into logical modules (`core/ipc.ts`)
  - Reorganized menu handlers (`core/menu/`) 
  - Improved setup modules (`core/setup/`)
- Updated main entry point architecture for better static file handling
- Consolidated utility functions with new helper modules
- Added caching utilities and improved file handling

### 🧹 Cleanup & Performance
- Removed legacy storage manager implementation 
- Eliminated deprecated helper functions and unused code
- Improved development server and build scripts


## v0.3.2 - 2025-06-25

### 🔄 Storage Improvements
- Performance improvements with caching system


## v0.3.1 - 2025-06-23

### 🔄 Storage Synchronization
- Cross-device storage sync with automatic synchronization
- Performance improvements for large storage operations
- Real-time sync status with loading indicators

## v0.3.0 - 2025-06-22

### ✨ Obsidian-like File Storage
- Tasks now stored as individual markdown files with YAML frontmatter
- Organized by date in Documents/Daily/YYYY-MM-DD/ structure
- Local-first approach with cloud sync compatibility
- Assets stored separately in assets/ folder
- Automatic migration from previous storage system

## v0.2.1 - 2025-06-16

### Bug Fixes
- Fixed the issue where the app wouldn't apply the system theme on launch


## v0.2.0 - 2025-06-14

### First Public Release

🚀 **Daily** — a minimalist, offline-first task manager designed around your daily Markdown notes.

No cloud. No accounts. Just tasks, just days.

---

#### 📦 Download

| OS      | Installer                                              |
|---------|---------------------------------------------------------|
| 🖥 macOS | [Download `.dmg`](https://github.com/scheron/Daily/releases/download/v0.2.0/Daily-0.2.0.dmg) |
| 🪟 Windows | [Download `.exe`](https://github.com/scheron/Daily/releases/download/v0.2.0/Daily-0.2.0.exe)       |
| 🐧 Linux  | [Download `.AppImage`](https://github.com/scheron/Daily/releases/download/v0.2.0/Daily-0.2.0.AppImage) |

> If you see a warning about an unverified developer, [follow the update instructions](https://github.com/scheron/Daily#-updating).

---

#### ✨ Features

- Organize tasks by day 📅
- Markdown support 📝
- Keyboard-first UX ⌨️
- Tags & multiple themes 🎨
- Dotfiles integration (`~/.config/daily`)
- Local-first & exportable as `.md`

---

#### 🔄 Updating

Daily doesn’t auto-update. You’re in control.  
Update instructions: [#-updating](https://github.com/scheron/Daily#-updating)

---

#### 💬 Feedback

Found a bug? Have an idea?  
→ [Open an issue](https://github.com/scheron/Daily/issues) or drop a ⭐ to support the project.

---

Let Daily help you stay on track — one day at a time. ☀️
