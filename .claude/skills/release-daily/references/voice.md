# Release notes voice — reference

The release-daily skill writes **product-style** release notes — the kind end users read in the App Store update list, the kind written for the lived user experience. This file captures what that voice sounds like in the wild, so the skill can match the bar.

Read the whole file once when drafting; jump back to specific sections via the TOC when verifying a pattern.

## Contents

| §   | Section                                                                                                                   | When to read it                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | [The App Store gold standard](#1-the-app-store-gold-standard)                                                             | Always — sets the baseline voice                                                                      |
| 2   | [Other strong product changelogs — Linear, Figma](#2-other-strong-product-changelogs--linear-figma)                       | When deciding tone for a section heavier on specifics                                                 |
| 3   | [Our own house style](#3-our-own-house-style)                                                                             | Before drafting any release in this project                                                           |
| 4   | [Worked example — raw git log to polished CHANGELOG](#4-worked-example--raw-git-log-to-polished-changelog)                | When the filter feels ambiguous — the side-by-side teaches the transformation                         |
| 5   | [Rules for translating engineering work into product notes](#5-rules-for-translating-engineering-work-into-product-notes) | Pull the matching rule when revising a draft bullet                                                   |
| 6   | [Special notations for unstable or transitional changes](#6-special-notations-for-unstable-or-transitional-changes)       | When asking the user about experimental features, upcoming changes, or a milestone-release intro note |

## 1. The App Store gold standard

Apple writes release notes for its own apps in a tight, friendly, benefit-first voice. The vocabulary is everyday. The structure is short. The reader doesn't have to know what the team did internally — they just learn what changed for them.

### What this voice does

- **Leads with the outcome the user gets.** "You can now do Y." "Tasks load faster." "Fixed an issue where…" — the bullet opens with the user's experience.
- **Uses everyday words.** "Faster", "smoother", "now syncs", "stays in place". Reach for vocabulary anyone would use, regardless of technical background.
- **Sentence-case, conversational.** Reads like a friendly note from the team to the user.
- **Stays factual and neutral about fixes.** "Fixed an issue where…" is the strongest emotional register. Just state what got fixed.
- **Uses a single catchall line** like "Also includes stability improvements" when there are many small invisible-but-real changes worth signalling without enumerating.

### Real-world shape (Apple's own apps)

This is the rhythm — short blocks, "What's New" framing, one or two highlights followed by a catchall:

```
Reminders
Version 18.2

What's New

• Add custom emoji to list icons to make your lists pop.
• Recurring reminders can now skip weekends automatically.
• This update also includes stability improvements.
```

```
Notes
Version 18.1

What's New

This update introduces collaborative tags — when you share a note, anyone you've shared it with can add tags too.

• Sketch in colour with the new pencil set.
• Quick Note now works from the Lock Screen.
• Bug fixes and performance improvements.
```

```
Maps
Version 18.2

• Find EV charging stations along your route, with live availability.
• Walking directions now include indoor maps for select airports.
• Resolves an issue where transit times were occasionally inaccurate.
```

### What we copy from this

- The opening — either a single short paragraph that captures the headline, or straight into bullets when no single headline dominates.
- The closing — a polite catchall like "Also includes stability improvements" when there are a lot of small invisible-but-real changes.
- The active, present-shaped voice for new things ("Add custom emoji…"), past-tense for fixes ("Fixed an issue where…").

## 2. Other strong product changelogs — Linear, Figma

Linear and Figma are widely cited as the best engineering-product changelogs in the industry, and they sit a notch more technical than Apple while still being product-led. Worth knowing about because some of our audience will appreciate a tiny bit more specificity than Apple's notes give.

### Linear — confident, specific, no fluff

Linear's changelog reads like a news report. Each item is one sentence, declarative, leads with the noun:

```
Triage views now respect saved filters.
Custom workflows can be exported to YAML for sharing across workspaces.
Slack integration: replying to a thread now updates the issue automatically.
```

What we borrow: the declarative, noun-first shape. Each bullet starts with the thing that changed — "Custom workflows can…", "Triage views now…", "Slack integration:…".

### Figma — playful, visual, organized by area

Figma groups changes by surface area (Design, FigJam, Dev Mode), and isn't afraid of a slightly warmer tone:

```
Design
- Components panel: drag a component onto a frame to attach it as a child instance.
- Auto layout: gap now supports negative values for stacking effects.

FigJam
- Stickies: add reactions with the new emoji picker.

Dev Mode
- Inspector: copy-button now copies tokens in the format selected by your team.
```

What we borrow: the section-by-area structure (we already do this with 🤖 AI / 🌐 MCP / etc.), and the surface-first phrasing inside each bullet ("Components panel: …", "Inspector: …").

## 3. Our own house style

Our project's existing CHANGELOG (read it in `CHANGELOG.md` before drafting) sits between Apple and Linear — closer to Apple in voice (friendly, benefit-first), closer to Linear in structure (occasional area prefix in bold).

### Section structure: type-based, not area-based

Group bullets by **type of change** — what kind of thing it is, not where in the code it lives. Readers scan for "is this new, fixed, or improved?" before they care which subsystem it touched.

The standard section set, in order of priority. Skip any section that has no entries:

| Section             | What goes here                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------- |
| 💥 Breaking Changes | Anything that breaks existing data, settings, or workflows. Always at the top when present. |
| ✨ New Features     | Capabilities the user can now do that they couldn't before.                                 |
| 🎨 Improvements     | Existing things that now work better — refined UX, new options on an old feature.           |
| 🐛 Bug Fixes        | Anything that was broken before.                                                            |
| ⚡ Performance      | Noticeable speed / memory / responsiveness wins.                                            |
| 🔒 Security         | Credential handling, sandboxing, vulnerability patches affecting users.                     |

### Two valid bullet-bolding patterns

Pick the one that fits the moment — sometimes a section uses both.

**Bold the feature name** when introducing a new capability with a memorable handle. The bold word becomes the headline of the bullet:

```
✨ New Features

- **Live AI Streaming** — the assistant now streams responses as they're generated, with reasoning shown in a collapsible panel that times itself.
- **MCP Server** — expose Daily's tasks and projects over a local MCP endpoint so external tools can read and edit them with explicit permission.
```

**Bold the area/module** when several bullets in one section need disambiguation. The bold word tells the reader where the change landed:

```
🐛 Bug Fixes

- **Sync** — fixed sync sometimes hanging when iCloud was still downloading the remote snapshot.
- **AI Assistant** — confirmed tool calls no longer hang if the assistant is cancelled mid-execution.
- Fixed images getting distorted instead of scaling proportionally in narrow task cards.
```

Note the third bullet has no bold — when the affected area is obvious from the description ("narrow task cards" only happens in one place in the app), the bold is just noise.

### Example releases — three sizes

#### Small fix-only release (v0.14.3-style)

```
## v0.14.3 - 2026-04-05

### 🐛 Bug Fixes

- Fixed tag filter not resetting when all tasks with a filtered tag are moved, deleted, or change status.
- Fixed images getting distorted instead of scaling proportionally in narrow task cards.
- Added automatic retry for images that fail to load after sync, with a manual retry button as fallback.
- Fixed markdown checkboxes being vertically centered instead of top-aligned on multi-line text.
- Added a "Copy" button to the image preview modal for copying images to clipboard.

---
```

#### Mid-size release with multiple types

```
## v0.14.5 - 2026-05-12

### ✨ New Features

- **Recurring tasks** — tasks can now repeat daily, weekly, or on custom intervals. Completing a recurring task spawns the next instance automatically.

### 🐛 Bug Fixes

- **Sync** — fixed crash during pull that caused every sync attempt to fail with a database constraint error.
- **iCloud Sync** — improved snapshot loading so iCloud placeholders no longer behave like missing remote data during sync.

### ⚡ Performance

- Opening a day with a large attachment list is now noticeably faster — attachments load lazily as you scroll, not all at once.

---
```

#### Architectural release with intro paragraph (exception)

When the entire release is one architectural jump dominated by a single area, drop the type grid for that section and use a single area-named section with an intro paragraph + nested bullets:

```
## v0.14.0 - 2026-03-24

### 🔄 iCloud Sync Improvements

Complete sync system overhaul: replaced snapshot-based approach with incremental delta synchronization and field-level merge.

**New architecture:**

- **Delta sync engine** — incremental sync of only changed fields via iCloud Drive
- **Field-level merge** — concurrent edits to different fields of the same document on different devices are both preserved
- **Change log** — SQLite triggers automatically capture all field-level mutations
- **Offline queue** — changes accumulate in local queue and sync when connectivity is restored

---
```

### House-style rules

- Trailing `---` separator between versions. Always.
- Sentence case in bullets. Capitalize first word, lowercase the rest unless proper noun.
- One bullet per user-visible outcome, not per commit. Multiple commits behind one feature → one bullet.
- Skip sections that have nothing to put in them — omit empty headings; the template is a menu, not a requirement.
- Pick the bold pattern (feature-name vs area) based on what's clarifying for the reader, not as a rigid rule.

## 4. Worked example — raw git log to polished CHANGELOG

This is the transformation in action. The raw input is a realistic ~2-week stretch of commits in Daily. The output is what the skill should produce after filtering, regrouping, and rewriting.

### Input — raw `git log` since last tag

```
a1b2c3d feat(ai): wire streaming callbacks in AIController loop with timing
d4e5f6a feat(ai): add ChatStreamAccumulator for unified delta protocol
b7c8d9e feat(ui): render streaming segments + Retry button + caret in ChatMessage
f0a1b2c feat(mcp): add MCP server with HTTP transport and tool dispatcher
9z8y7x6 feat(ai): redesign agent system with hooks, registry, durable sessions
e3d4f5a fix(sync): handle iCloud snapshot pending state gracefully
c1d2e3f fix(ai): force tool_choice=auto for remote thinking-mode models
a4b5c6d perf(ai): parallelize FS checks in LocalModelService.listModels
g6h7i8j refactor(ai): centralize error classes into shared/errors/
k9l0m1n test(ai): add integration tests for streaming flow
o2p3q4r chore(deps): bump electron to 36.1.0
s5t6u7v ci: add nightly macos arm64 build runner
w8x9y0z docs: update CLAUDE.md architecture section
m1n2o3p Merge branch 'feat/streaming-polish' into main
```

### Filtering pass — what survives

| Commit                                                        | Decision | Reason                                                         |
| ------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `feat(ai): wire streaming callbacks…`                         | ✅       | Streaming is user-visible.                                     |
| `feat(ai): add ChatStreamAccumulator…`                        | ✅ merge | Same feature as the first one — collapse together.             |
| `feat(ui): render streaming segments + Retry button + caret…` | ✅ merge | Same feature, UI side. Collapse with the above.                |
| `feat(mcp): add MCP server…`                                  | ✅       | New product surface.                                           |
| `feat(ai): redesign agent system with hooks, registry…`       | ✅       | New stateful assistant behaviour — translate the user benefit. |
| `fix(sync): handle iCloud snapshot pending state…`            | ✅       | User-observable hang fixed.                                    |
| `fix(ai): force tool_choice=auto for remote thinking-mode…`   | ✅       | Fixes a real broken interaction.                               |
| `perf(ai): parallelize FS checks in listModels`               | ✅       | Noticeable speedup in a UI list.                               |
| `refactor(ai): centralize error classes…`                     | drop     | Pure internal refactor.                                        |
| `test(ai): add integration tests for streaming flow`          | drop     | Test additions.                                                |
| `chore(deps): bump electron to 36.1.0`                        | drop     | No behaviour change for the user.                              |
| `ci: add nightly macos arm64 build runner`                    | drop     | CI infrastructure.                                             |
| `docs: update CLAUDE.md architecture section`                 | drop     | Internal docs.                                                 |
| `Merge branch 'feat/streaming-polish' into main`              | drop     | Merge commit.                                                  |

5 of 14 commits drop out immediately by shape (refactor/test/chore/ci/docs/merge). 3 of the survivors collapse into a single "Streaming" feature. Net: 5 distinct user-visible items from 14 raw commits.

### Output — polished CHANGELOG section

```
## v0.15.0 - 2026-06-07

### ✨ New Features

- **Live AI Streaming** — the assistant now streams responses as they're generated, with reasoning shown in a collapsible panel that times itself. Stop and retry mid-stream with the new Retry button.
- **MCP Server** — expose Daily's task and project actions over a local MCP endpoint so external tools can read and edit them with explicit permission.
- **Stateful AI Assistant** — the assistant now remembers conversations across restarts, and destructive tool calls require explicit confirmation before running.

### 🐛 Bug Fixes

- **Sync** — fixed sync sometimes hanging when iCloud was still downloading the remote snapshot in the background.
- **AI Assistant** — fixed an issue where remote thinking-mode models would stop responding after the first tool call.

### ⚡ Performance

- Listing installed local models is now noticeably faster, especially when several models are installed.

---
```

Note: bump from `0.14.3` to `0.15.0` (minor) is correct — multiple new features, no breaking changes. A patch wouldn't fit because users got real new capabilities, not just fixes.

## 5. Rules for translating engineering work into product notes

These are the rules the App-Store filter enforces. Each one is stated as the positive shape to write, with a short note on what it's catching so you recognise the situation when you see it in raw commits.

### Lead with the user's world, not the implementation

Write bullets that name the thing the user sees, the experience they have. Anchor on UI surfaces ("narrow task cards", "the image preview modal"), data ("scheduled posts", "tag filters"), and observable behaviour ("sync", "loading", "rendering"). The implementation underneath — class names, file paths, CSS properties, algorithms — stays in git.

**Sounds like:** "Fixed images getting distorted instead of scaling proportionally in narrow task cards."

Catches: phrasing that names internal classes, file paths, or technical mechanisms (`object-fit`, `ImageRenderer`, `setState`) that the user can't see or act on.

### Keep pronouns impersonal — favour the noun

State what changed by naming the thing. "Tasks", "Conversations", "Tool calls", "Sync" — the noun reads as a system fact. Apple's release notes do use "you" and "your" softly, but our house voice leans impersonal: it reads less like marketing copy aimed at a single reader and more like a neutral record of what shipped.

**Sounds like:** "Conversations persist across app restarts, so the assistant remembers context from yesterday." "Destructive tool calls require explicit confirmation before running."

Catches: bullets that address the reader directly inside our type-grid sections — "your tasks", "your data", "your settings", "you can now…". The fix is usually to substitute the noun or restate as a fact about the system: "Tasks now…", "Settings include…", "The assistant remembers…".

### Translate every commit subject — strip conventional-commit syntax

Drop the `type(scope):` prefix. Rewrite the rest in plain English describing what the user gets.

**Sounds like:** "The AI assistant is now stateful — it remembers conversations across restarts, and destructive tool calls require explicit confirmation before running."

Catches: subjects with `feat(...)`, `fix(...)`, `refactor(...)`, `chore(...)` leaking through verbatim. That syntax is git's, not the user's.

### Omit invisible refactors entirely

Internal refactors that preserve behaviour (centralising error classes, renaming exports, switching iteration utilities, reorganising folders) produce zero bullets. They live in git history; that's where curious readers can find them.

**Result:** the refactor produces no text at all in CHANGELOG.md.

Catches: bullets that exist only because work happened, not because something changed for the reader. Each such bullet dilutes the things readers do care about.

### Stay factual and neutral on fixes

State what got fixed, with enough specificity that a user who hit the bug recognises it. Skip emotional framing on either side.

**Sounds like:** "Fixed a crash that could occur when opening a task with an attached file larger than 50 MB."

Catches: apologetic wording ("we finally fixed", "sorry for"), self-congratulatory wording ("massive improvement"), and value judgements about past behaviour ("the awful crash"). Apple's release notes are emotion-flat by design, and we follow that.

### Group above roughly seven bullets

Once a section grows past seven or so bullets, split it. Either use bold area prefixes inside the bullets (`**Sync** — …`, `**AI Assistant** — …`) or move some items into their own typed section (`🎨 Improvements` next to `🐛 Bug Fixes`).

**Result:** readers can scan and find what affects them. Long flat lists read as "we shipped a pile this time" and the eye glazes over.

Catches: 15+ bullets under one heading with no internal structure.

### Use the catchall as a closing line only

"Also includes stability improvements" is a useful closer when many small invisible fixes deserve a wave-in-the-direction-of but don't each warrant a bullet. Use it as the final line of a section that already has real, specific bullets above it.

**Sounds like:** ending a `🐛 Bug Fixes` section with `- Also includes stability and performance improvements across the app.`

Catches: a section consisting only of "Various improvements and bug fixes" with no specifics. That's the lazy form and reads as "we don't really know what changed".

## 6. Special notations for unstable or transitional changes

Some releases ship work the user should know is "in motion" — early-access, scheduled to change, or actively breaking. Three notations cover that ground. Most routine releases use none of these; reach for them when a release genuinely calls for one.

### Experimental features

When shipping a feature behind a known boundary — beta quality, limited surface area, the shape may still change — flag it explicitly so users opt in eyes-open and know to expect rough edges.

**Sounds like (bold-label form):**

```
- **Experimental:** Live AI Streaming — the assistant streams responses as they're generated. Please try it out and report feedback in [#42] if anything looks off.
```

**Sounds like (emoji form):**

```
- 🧪 Live AI Streaming — the assistant streams responses as they're generated.
```

Either form works. The label or icon sets expectations, the rest of the bullet describes the experience.

Reach for this when shipping a feature confidently but the final shape might shift based on usage feedback. Once it stabilises in a later release, drop the marker.

### Upcoming behavior changes

When a future release will change behaviour in a way users should plan for — typically a deprecation or a scheduled breaking switch — announce it ahead of time with a dedicated section.

**Sounds like:**

```
### ⚠️ Upcoming behavior changes

Starting with v0.16.0, the iCloud sync engine will require macOS 14 or newer. macOS 13 users will get a one-time warning in this release before the cutoff lands. See [#127] for the discussion.
```

Place this section near the top of the release, right under `💥 Breaking Changes` if both are present, or just under the version header otherwise. Keep it short — one paragraph per upcoming change, with a link to the discussion or tracking issue.

Use this once a decision is made and dated; that lets users plan rather than be surprised next release.

### Breaking-changes top-level note

For releases that include significant breaking changes — usually major bumps, occasionally a meaningful minor — add a one-paragraph note immediately under the version header, before any sections. One paragraph, no bullets, no apology, just orientation.

**Sounds like:**

```
## v1.0.0 - 2027-01-15

This release stabilises the v0.x APIs that became reliable over the last six months. Migration takes 5–10 minutes for most setups; the [migration guide] walks through the four affected settings. If you hit anything unexpected, [file an issue].

### 💥 Breaking Changes

- ...
```

Reserve the top-level note for milestone releases where the user benefits from a paragraph of context before scanning bullets. Routine releases let the sections speak for themselves.
