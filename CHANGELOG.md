# Changelog

## v0.4.0 - 2025-08-31

### ✨ New Features

- **🎯 Focus Timer** - Introducing a dedicated focus timer window to help user stay concentrated on each tasks
  - Track time spent on individual tasks
  - Visual progress indicators showing completion percentage
  - Separate timer window for distraction-free focus sessions
  - Real-time timer statistics and focus session tracking

- **⏱️ Estimated Time Tracking** - Plan your day better with time estimation features
  - Set estimated time for tasks during creation or editing
  - Visual indicators showing actual vs estimated time
  - TimePicker component for easy time selection
  - Smart duration formatting and display

### 🎨 UI/UX Improvements

- **🎨 Major Interface Redesign** 
  
  | Before | After |
  |--------|-------|
  | ![Previous Design](media/Demo.png) | ![New Design](media/Demo-new.png) |
  
- **Enhanced Task Cards** - Redesigned task items with better visual hierarchy
  - Better visual indicators for task status
  - Cleaner presentation of time information
  - Enhanced quick actions and status management

- **Restructured Main Interface** - Complete reorganization for better workflow
  - New header component with improved navigation
  - Redesigned toolbar with dedicated edit and filter panels
  - Better content organization and layout structure
  - Improved day picker with calendar integration

- **📱 Interactive Tooltips** - Added tooltip support throughout the interface for better user guidance

---

## v0.3.5 - 2025-08-18

- fix: issue where save&continue not saves tags
- refactor(ui): reorganize components into common directory structure
 feat: add watch on add or delete current robot portfolios for subscribe

## v0.3.6 - 2025-08-25

### ✨ New Features
- **Task Rescheduling** - Tasks are now flexible! Move them to any day you want with the new **Move Task** option in edit mode.

---

## v0.3.5 - 2025-08-17

### 🐛 Bug Fixes
- **Task Editor** - Fixed issue where "Save & Continue" action was resetting previously assigned tags instead of preserving them

### 🏗️ Code Organization
- Improved UI components structure for better maintainability

---

## v0.3.4 - 2025-07-06

### 🎨 UI/UX Improvements
- **Theme flexibility** - Dark themes can now be used with light mode system preferences
- **Task styling** - Removed line-through style for completed tasks for better readability

### 🏗️ Architecture Refactoring
- **Enhanced app lifecycle management** - Consolidated setup functions and improved protocol handling
- Improved CSP (Content Security Policy) setup
- Better protocol handling for deep links and file associations
- Optimized cache utility performance

---

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

---

## v0.3.2 - 2025-06-25

### 🔄 Storage Improvements
- Performance improvements with caching system

---

## v0.3.1 - 2025-06-23

### 🔄 Storage Synchronization
- Cross-device storage sync with automatic synchronization
- Performance improvements for large storage operations
- Real-time sync status with loading indicators

---

## v0.3.0 - 2025-06-22

### ✨ Obsidian-like File Storage
- Tasks now stored as individual markdown files with YAML frontmatter
- Organized by date in Documents/Daily/YYYY-MM-DD/ structure
- Local-first approach with cloud sync compatibility
- Assets stored separately in assets/ folder
- Automatic migration from previous storage system

---

## v0.2.1 - 2025-06-16

### Bug Fixes
- Fixed the issue where the app wouldn't apply the system theme on launch

---

## v0.2.0 - 2025-06-14

### First Public Release

🚀 **Daily** — a minimalist, offline-first task manager designed around your daily Markdown notes.

No cloud. No accounts. Just tasks, just days.

#### 📦 Download

| OS      | Installer                                              |
|---------|---------------------------------------------------------|
| 🖥 macOS | [Download `.dmg`](https://github.com/scheron/Daily/releases/download/v0.2.0/Daily-0.2.0.dmg) |
| 🪟 Windows | [Download `.exe`](https://github.com/scheron/Daily/releases/download/v0.2.0/Daily-0.2.0.exe)       |
| 🐧 Linux  | [Download `.AppImage`](https://github.com/scheron/Daily/releases/download/v0.2.0/Daily-0.2.0.AppImage) |

> If you see a warning about an unverified developer, [follow the update instructions](https://github.com/scheron/Daily#-updating).


#### ✨ Features

- Organize tasks by day 📅
- Markdown support 📝
- Keyboard-first UX ⌨️
- Tags & multiple themes 🎨
- Dotfiles integration (`~/.config/daily`)
- Local-first & exportable as `.md`

#### 🔄 Updating

Daily doesn’t auto-update. You’re in control.  
Update instructions: [#-updating](https://github.com/scheron/Daily#-updating)


Let Daily help you stay on track — one day at a time. ☀️
