---
name: release-daily
description: Cut a release of the Daily app — analyze commits + diffs since the last tag, filter to user-facing changes only (App Store-style product changelog, NOT engineering log), interactively propose 2-3 phrasing options per section and a version bump with recommendations, then on user approval invoke `pnpm release` non-interactively with the agreed values. Use this skill whenever the user says "release", "релиз", "выпустить", "новый релиз", "новая версия", "bump version", asks what changed since the last release, or wants help drafting CHANGELOG entries or deciding what version to ship. Also triggers when the user mentions CHANGELOG.md, `scripts/release.js`, or version-tag workflows in this project.
---

# Release the Daily project

This skill produces an **App Store-style product changelog** — the kind end users read in the App Store updates list. The voice is "what changed for me", never "what we did in the code".

**Before drafting anything, read [`references/voice.md`](references/voice.md).** It captures the voice in detail: how Apple writes release notes for its own apps (the gold standard we anchor on), how Linear and Figma frame product changelogs, what our own house style looks like across past releases, and a curated list of anti-patterns. The patterns in there matter more than any individual example, and the file exists precisely so SKILL.md can stay short while still anchoring you to a reliable bar.

Quick taste, so you know what we're aiming for:

- ✅ "Fixed images getting distorted instead of scaling proportionally in narrow task cards."
- ❌ "Switched ImageRenderer from object-fit:cover to object-fit:contain."

Changes the user never perceives — internal refactors, test additions, dependency bumps without behaviour change, hook/architecture rework that doesn't surface, file renames, lint conventions — are EXCLUDED from the changelog entirely. They live in git history; users don't read git history.

## The flow

The skill is interactive end-to-end. Never invoke `pnpm release` until the user has approved both the CHANGELOG text and the version. The whole point is that the user signs off before anything is committed/tagged/pushed.

### Step 1 — preconditions

```bash
git rev-parse --abbrev-ref HEAD    # must be "main"
git status --porcelain             # must be empty
```

If not on `main` with a clean tree, STOP. Tell the user, and if needed help them finish/merge first. The release script will refuse anyway.

If the user explicitly says "just preview, don't release yet" — fine, you can run steps 2-7 from any branch and skip step 8.

### Step 2 — gather everything that changed

Don't trust commit subjects alone. Read the **bodies and the diffs**, because subjects compress a lot (especially squashed merges). For each commit:

```bash
LAST_TAG=$(git describe --tags --abbrev=0)
git log "${LAST_TAG}..HEAD" --pretty=format:"%H%n%s%n%b%n---" --no-merges

# For each commit, also check the file scope:
git show --stat <SHA>

# For big squashed commits, sample the substantial diffs:
git show <SHA> -- <path-of-interest>
```

If `git describe` fails (no tags yet), this is the first release. Use `git log HEAD` and confirm with the user before treating all of history as "new".

### Step 3 — filter to user-facing changes (the App Store filter)

For every change you discovered, ask: **"Would a non-technical user reading the release notes care about this?"** Only keep what passes.

Quick filter heuristics:

| Type of change                                                            | User-facing?                  |
| ------------------------------------------------------------------------- | ----------------------------- |
| New visible feature (button, panel, capability)                           | ✅ YES                        |
| Fix for something users could observe (crash, wrong rendering, lost data) | ✅ YES                        |
| Noticeable speed/responsiveness improvement                               | ✅ YES                        |
| Migration to a new model/format users will benefit from                   | ✅ YES — describe the benefit |
| Internal refactor preserving behavior                                     | ❌ NO                         |
| Renamed functions / moved files / lint conventions                        | ❌ NO                         |
| Added tests, eval harness, observability logs                             | ❌ NO                         |
| Updated dependencies without behavior change                              | ❌ NO                         |
| Documentation in the repo                                                 | ❌ NO                         |

Auto-excludes by commit shape (drop these without even thinking about them):

- Conventional prefixes that never ship to users: `chore:`, `ci:`, `test:`, `refactor:`, `style:`, `build:`, `docs:` (unless the docs describe a new user-facing feature — then describe the feature instead).
- Merge commits — `Merge branch …`, `Merge pull request …` — they contribute nothing on their own.
- Bot commits — dependabot, renovate, `*-bot[bot]` — unless they ship a behaviour change worth surfacing.
- Release commits — `release: v…`, `chore: release v…`. The previous release already counted.
- Revert commits paired with their original — if both land in the same range, both drop out.

When a commit mixes user-facing + invisible work (e.g. "add MCP server + refactor tools to registry"), keep ONLY the MCP server bullet; drop the refactor. Users got MCP, the refactor was an implementation detail.

### Step 4 — group into sections

Group changes by **type of change** (what kind of thing it is), not by area of the codebase. This is the App Store / Linear / Figma pattern — readers scan for "what's new vs what got fixed" first, then dive into specifics.

Use these section headings, in this order. Skip any section that has no entries:

- 💥 **Breaking Changes** — anything that breaks existing user data, settings, or workflows. Always at the top when present.
- ✨ **New Features** — new capabilities the user can now do
- 🎨 **Improvements** — existing things that now work better (refined UX, new options on an old feature, smarter defaults)
- 🐛 **Bug Fixes** — anything that was broken before
- ⚡ **Performance** — noticeable speed / memory / responsiveness wins
- 🔒 **Security** — credential handling, sandboxing, vulnerability patches that affect users

When several bullets in one section belong to distinct areas (e.g. one Bug Fix in Sync, another in the AI assistant), use **bold area prefixes** inside the bullet — `**Sync** — fixed the snapshot deadlock…`. This keeps the type-based grouping while still telling the reader where the fix landed.

**Exception — architectural release**: when the entire release is one architectural jump dominated by a single area (like the v0.14.0 "iCloud Sync Improvements" overhaul), it's fine to use a single area-named section with an intro paragraph + nested bullets, instead of forcing it into the type grid. The intro paragraph carries the "what's the headline" and the bullets carry the parts. See `references/voice.md` for the v0.14.0 example.

### Step 5 — per-section interview (the CORE of this skill)

For **each section** identified in step 4, draft **2-3 distinct phrasing options** and ask the user to pick. Use the `AskUserQuestion` tool. Mark one option as **(Recommended)**.

The options should differ meaningfully — they're not just synonyms. For example:

- **Option A — terse**: a single bullet per major outcome.
- **Option B — structured**: an intro paragraph + nested bullets for the parts.
- **Option C — narrative**: a short story of the experience the user gets.

For tiny sections (1 bullet), a single phrasing is fine — just confirm with the user.

Each option must be a complete, paste-ready section. Don't show fragments; show the actual final markdown that would land in CHANGELOG.md.

Voice rules for every option:

- Past tense for fixes, present-shaped imperative for new things — "Fixed X", "Add Y". Never "We fixed X" or "fix X".
- No conventional-commit prefixes (`feat(...)`, `fix(...)`).
- Lead with the OUTCOME, not the mechanism. "Tasks load 4× faster on big lists" beats "Replaced ListView with virtualized renderer".
- Bold the module when bullets span several areas: `**Sync** — fixed the snapshot deadlock when iCloud is offline.`
- One bullet per user-visible outcome. Multiple commits for one feature → one bullet.

For full reference formatting (single-bullet section, structured section with intro paragraph, mixed bullets with module emphasis, plus anti-pattern contrasts), see [`references/voice.md`](references/voice.md). Re-read 2–3 of the most recent CHANGELOG entries every time before drafting — voice consistency between releases is what makes the bar feel maintained.

### Step 6 — version bump interview

Show **all three** options (patch / minor / major) with reasoning, and mark the recommended one. Use `AskUserQuestion`. Reasoning shapes:

| Bump                        | When                                                        | This release qualifies if...                                                                            |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **patch** (0.14.3 → 0.14.4) | Only bug fixes + invisible refactors                        | Every section is 🐛 Bug Fixes                                                                           |
| **minor** (0.14.3 → 0.15.0) | New user-facing features without breaking                   | Any section adds new capability (AI, MCP, new UI)                                                       |
| **major** (0.14.3 → 1.0.0)  | Breaking changes — data shape, settings keys, external APIs | Schema migration drops a field, removed a setting users may have configured, changed an export contract |

Let the user override the recommendation — they know intent you can't infer.

### Step 7 — pre-flight verification

Before invoking the script, run all gates. A red gate post-tag means a hotfix and a wasted version number.

```bash
pnpm check:all
```

That runs lint + typecheck (main / render / shared) + circular + tests. If any of those fail, STOP and tell the user. Don't proceed unless the user explicitly says "ignore, ship anyway".

**About test failures:** the project may have pre-existing test failures unrelated to current changes (you've seen baselines like "11 failed / 68 passed" as a stable baseline). Don't block on those — but DO verify the baseline didn't worsen. Compare against `main` if needed.

### Step 8 — assemble and confirm the final text

Stitch the selected per-section options together with:

- `## v${nextVersion} - ${YYYY-MM-DD}` header
- One blank line
- Each chosen section in order
- `---` separator at the end

Show the full text to the user one more time. Print it as a single markdown block. Then ask:

> "Шипим v${nextVersion} с этим текстом? (yes/no/edit)"

- `yes` → step 9
- `no` → STOP. Don't release.
- `edit` → ask what to change, redo step 5 or 6 for the affected section, then re-confirm.

### Step 9 — invoke the script non-interactively

Write the agreed section to a temp file and invoke `pnpm release` with flags:

```bash
SECTION_FILE=$(mktemp -t release-section.XXXXXX.md)
cat > "$SECTION_FILE" <<'EOF'
<the full section text the user approved>
EOF

pnpm release --version="$NEXT_VERSION" --changelog-file="$SECTION_FILE"
```

With both flags set, the script runs in non-interactive mode: it replaces the `## [Unreleased]` placeholder (or inserts after `# Changelog` if no placeholder), bumps `package.json`, commits `release: v${nextVersion}`, tags `v${nextVersion}`, and pushes both branch and tag to origin.

After the push completes, report success and the tag URL. If the project ships through electron-builder with auto-update, mention that CI/manual `pnpm build` is what publishes the artifacts the updater will pick up.

## Edge cases worth handling proactively

- **Huge squashed commits.** A single commit body lists 8 phases of work and 100+ files. Don't compress that back to one line — read the body and pull each USER-FACING phase into its own bullet. Internal phases (refactors, test additions) still drop out.
- **No `## [Unreleased]` placeholder.** The script falls back to inserting after `# Changelog`. Fine — no special handling needed.
- **Multiple features that touch the same area.** Group them under one section heading even if they came from different phases. The user reads by topic, not by phase.
- **One ambiguous commit.** If you can't tell from the subject/body/diff whether a change is user-facing, ask the user. Better one extra question than a wrong inclusion.
- **CHANGELOG style drift.** Match the most recent 2-3 entries. If they're terse, stay terse. If they use structured intros, use structured intros for similarly-sized scope.
- **User says "skip the interview, just draft it."** That's fine — produce a single best-effort draft and ask for revisions in chat. Don't force the per-section AskUserQuestion flow if the user opts out.
- **Auto-update artifacts.** `pnpm release` only tags. Building/publishing the .dmg lives in CI or a separate step. If the user expects the release to be in the App Store / auto-update channel immediately, gently point out the missing build step.

## What this skill does NOT do

- Generate marketing copy or App Store metadata beyond the CHANGELOG entry.
- Make decisions about whether a change is worth shipping — that's the user's call.
- Bypass pre-flight gates when they fail unless the user explicitly says so.
- Push without explicit user approval at step 8.
