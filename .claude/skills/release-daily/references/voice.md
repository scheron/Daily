# Release notes voice — reference

The release-daily skill writes **product-style** release notes — the kind end users read in the App Store update list, not the kind engineers read in `git log`. This file captures what that voice sounds like in the wild, so the skill can match the bar.

Read this whenever you're about to draft a CHANGELOG section. The patterns matter more than any single example.

## 1. The App Store gold standard

Apple writes release notes for its own apps in a tight, friendly, benefit-first voice. The vocabulary is everyday. The structure is short. The reader doesn't have to know what the team did internally — they just learn what changed for them.

### What this voice does

- **Leads with the outcome the user gets.** Not "we refactored X", but "you can now do Y".
- **Uses everyday words.** "Faster", "smoother", "now syncs". Never "performant", "throughput", "race condition".
- **Sentence-case, conversational.** Reads like a friendly note, not a press release or a Jira ticket.
- **Groups stability/performance/bug fixes under a single catchall line** unless one specific fix is worth calling out by name.
- **Doesn't apologize for past bugs.** "Fixed an issue where…" is the strongest negative tone you'll see. No "we're sorry", no "finally fixed".

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

What we borrow: the declarative, noun-first shape. Avoid "We added…" — just "Custom workflows can…".

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
- **MCP Server** — expose your tasks and projects over a local MCP endpoint so external tools can read and edit them with your permission.
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
- Skip sections that have nothing to put in them — don't write an empty `### ✨ New Features` heading just because the template lists it.
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
| `refactor(ai): centralize error classes…`                     | ❌       | Pure internal refactor.                                        |
| `test(ai): add integration tests for streaming flow`          | ❌       | Test additions.                                                |
| `chore(deps): bump electron to 36.1.0`                        | ❌       | No behaviour change for the user.                              |
| `ci: add nightly macos arm64 build runner`                    | ❌       | CI infrastructure.                                             |
| `docs: update CLAUDE.md architecture section`                 | ❌       | Internal docs.                                                 |
| `Merge branch 'feat/streaming-polish' into main`              | ❌       | Merge commit.                                                  |

5 of 14 commits drop out immediately by shape (refactor/test/chore/ci/docs/merge). 3 of the survivors collapse into a single "Streaming" feature. Net: 5 distinct user-visible items from 14 raw commits.

### Output — polished CHANGELOG section

```
## v0.15.0 - 2026-06-07

### ✨ New Features

- **Live AI Streaming** — the assistant now streams responses as they're generated, with reasoning shown in a collapsible panel that times itself. Stop and retry mid-stream with the new Retry button.
- **MCP Server** — expose Daily's task and project actions over a local MCP endpoint so external tools can read and edit your data with your permission.
- **Stateful AI Assistant** — the assistant now remembers conversations across restarts, and tool calls that could change your data require explicit confirmation.

### 🐛 Bug Fixes

- **Sync** — fixed sync sometimes hanging when iCloud was still downloading the remote snapshot in the background.
- **AI Assistant** — fixed an issue where remote thinking-mode models would stop responding after the first tool call.

### ⚡ Performance

- Listing installed local models is now noticeably faster, especially when several models are installed.

---
```

Note: bump from `0.14.3` to `0.15.0` (minor) is correct — multiple new features, no breaking changes. A patch wouldn't fit because users got real new capabilities, not just fixes.

## 4. Anti-patterns — engineering log creeping into product notes

These are the failures the App-Store filter exists to catch. Each pair shows the same change written two ways.

### Implementation-mechanism phrasing

❌ "Switched ImageRenderer from `object-fit: cover` to `object-fit: contain` for narrow containers."

✅ "Fixed images getting distorted instead of scaling proportionally in narrow task cards."

The user doesn't have an ImageRenderer. They have task cards that show images wrong. Lead with their world.

### Conventional-commit prefixes leaking through

❌ "feat(ai): redesign agent system with hooks, registry, and durable sessions."

✅ "The AI assistant is now stateful — it remembers conversations across restarts, and tool calls require confirmation when they could change your data."

The prefix `feat(ai):` is git syntax. Users don't read git. Strip it and translate.

### Internal refactor in the changelog

❌ "Centralized all error classes into `src/shared/errors/` with one file per error code."

✅ (omit entirely)

This is a real change, but the user can't perceive it. It belongs in git history. Putting it in release notes adds noise that drowns the things they _do_ care about.

### Apologetic / negative tone

❌ "We finally fixed the awful crash that's been frustrating users for weeks."

✅ "Fixed a crash that could occur when opening a task with an attached file larger than 50 MB."

Specific, factual, no emotional baggage. Apple never apologizes in its release notes — neither should we.

### Pile of bullets without grouping

❌ Twenty unrelated bullets in a flat list under one `🐛 Bug Fixes` heading.

✅ Group by area when bullet count goes over ~7. Use **module bold** prefix or split into multiple sections (🐛 Bug Fixes, 🔄 Sync, 🤖 AI Assistant).

A flat wall of bullets reads as "we threw a lot at the wall this time" and the eye glazes over by item 8. Structure helps the user find what affects _them_.

### "Misc improvements" with no detail

❌ "Various improvements and bug fixes."

✅ "Stability and performance improvements." (only as a catchall trailing line, never as the entire section)

"Various" is the lazy version. Apple uses the catchall, but as a closing line under a real-content section — never as the section itself.
