# <img src="./src/renderer/public/favicon.svg" width="25" height="25" /> Daily

**Daily** — A task management application focused on productivity, minimalism, and convenience. ✨

![Desktop Demo](./media/Demo-super-new.png)

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

No bloat. No accounts. No complexity.
Just a lightweight, local-first tool to help me stay on track, one day at a time.

---

### ✨ Features

- **Day-centric workflow** 📅 — organize tasks by date, focus on what matters today
- **Calendar navigation** — jump to any day, review past work, plan ahead
- **Fuzzy search** 🔍 — find any task instantly with intelligent fuzzy matching that handles typos
- **Rich task content** 📝 — markdown formatting, embedded images, file attachments
- **Time tracking** ⏱️ — estimate how long tasks will take, track actual time spent
- **Focus timer** 🪟 — dedicated timer window to stay concentrated on one task
- **Quick retrospectives** — see what you did yesterday, plan what you'll do today
- **Smart organization** 🏷️ — group tasks by project, priority, or context with tags
- **Beautiful themes** 🎨 — choose from 9+ UI themes to match any style
- **iCloud sync** ☁️ — optional cross-device synchronization for seamless workflow
- **Local-first** 📁 — everything stored locally, works completely offline
- **Keyboard shortcuts** ⌨️ — navigate and manage tasks without touching your mouse

---

## 🎬 Showcase

See Daily in action with these feature demonstrations:

<div align="center">

### Managing Tasks

![Managing Tasks](./media/showcase/tasks-managment.gif)

### Tag Management

![Tag Management](./media/showcase/tags-managment.gif)

### Delete & Restore Tasks

![Delete Restore](./media/showcase/delete-restore.gif)

### Move Task

![Move Tasks](./media/showcase/move-tasks.gif)

### Search Tasks

![Search Tasks](./media/showcase/search.gif)

### iCloud Sync

![Sync](./media/showcase/sync.gif)

</div>

---

## 💾 Data Privacy & Control

Daily stores everything locally on Mac — no accounts, no mandatory cloud dependency, no subscription fees.

### Rich Task Content

Create tasks with everything you need:

- **📝 Markdown formatting** — headers, lists, links, code blocks
- **🖼️ Images & Screenshots** — paste images directly with `Cmd+V` or drag & drop
- **⏱️ Time Tracking** — set estimates and track actual time spent
- **🏷️ Tags** — organize tasks by project, priority, or context

### Why Local-First Storage?

- **🔒 Private by Default** — tasks stay on the device unless sync is enabled
- **✈️ Always Available** — work offline anytime, no internet required
- **💰 Zero Cost** — no required subscriptions or storage fees
- **🛡️ Safe & Reliable** — automatic conflict prevention, no data loss
- **📦 Easy Backup** — simple export for backups or migration
- **☁️ Optional Sync** — enable iCloud sync when cross-device access is needed

---

### 🗺️ Coming Soon

- **Voice to task** 🎤 — voice recording to task

---

## 🚀 Installation

> [!NOTE]
> **macOS Only**: Daily currently supports only macOS. While built with Electron (which supports cross-platform deployment), this is a personal project and I don't have Windows or Linux systems available for proper testing and support (or I'm just lazy 🤷‍♂️).

1. Go to [Releases](https://github.com/scheron/Daily/releases)
2. Download the `.dmg` file for macOS

> [!NOTE]
> The app is currently **not signed or notarized**:
>
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

Enjoy using **Daily** — organize tasks, own the days. ☀️
