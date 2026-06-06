---
name: release-daily
description: Cut a release of the Daily app — analyze commits + diffs since the last tag, filter to user-facing changes only (App Store-style product changelog), interactively propose 2-3 phrasing options per section and a version bump with recommendations, then on user approval invoke `pnpm release` non-interactively with the agreed values. Use this skill whenever the user says "release", "релиз", "выпустить", "новый релиз", "новая версия", "bump version", asks what changed since the last release, or wants help drafting CHANGELOG entries or deciding what version to ship. Also triggers when the user mentions CHANGELOG.md, `scripts/release.js`, or version-tag workflows in this project.
---

# Release the Daily project

This skill produces an **App Store-style product changelog** — the kind end users read in the App Store updates list. The voice describes the lived user experience: what they can now do, what now works better, what got fixed.

**Before drafting anything, read [`references/voice.md`](references/voice.md).** It captures the voice in detail: how Apple writes release notes for its own apps (the gold standard we anchor on), how Linear and Figma frame product changelogs, our own house style across past releases, a full worked example (raw git log → polished CHANGELOG), and six positive rules for translating engineering work into product copy. The patterns in there matter more than any individual example, and the file exists precisely so SKILL.md can stay short while still anchoring you to a reliable bar.

Quick taste, so you know the target voice:

- "Fixed images getting distorted instead of scaling proportionally in narrow task cards."
- "**MCP Server** — expose Daily's task and project actions over a local MCP endpoint so external tools can read and edit your data with your permission."

Changes that live entirely inside the implementation — internal refactors, test additions, dependency bumps without behaviour change, hook/architecture rework that doesn't surface, file renames, lint conventions — stay in git history and produce no bullet at all. That keeps the changelog focused on what the user perceives.

## The flow

The skill is interactive end-to-end. The user signs off on both the CHANGELOG text and the version before anything is committed, tagged, or pushed. `pnpm release` runs only after explicit approval at step 8.

### Step 1 — preconditions

```bash
git rev-parse --abbrev-ref HEAD    # must be "main"
git status --porcelain             # must be empty
```

If the branch isn't `main` or the tree has uncommitted changes, STOP and tell the user — finishing/merging first is the right next step, and the release script will refuse anyway.

If the user explicitly asks for "just a preview, no release yet", run steps 2–7 from any branch and stop before step 8.

### Step 2 — gather everything that changed

Read commit subjects AND bodies AND diffs — subjects compress a lot, especially in squashed merges, and the body often carries the real shape of the work.

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

For every change you discovered, ask: **"Would a non-technical user reading the release notes care about this?"** Only changes that pass this question survive into the draft.

Quick filter heuristics:

| Type of change                                                            | User-facing?                  |
| ------------------------------------------------------------------------- | ----------------------------- |
| New visible feature (button, panel, capability)                           | ✅ YES                        |
| Fix for something users could observe (crash, wrong rendering, lost data) | ✅ YES                        |
| Noticeable speed/responsiveness improvement                               | ✅ YES                        |
| Migration to a new model/format users will benefit from                   | ✅ YES — describe the benefit |
| Internal refactor preserving behavior                                     | stays in git history          |
| Renamed functions / moved files / lint conventions                        | stays in git history          |
| Added tests, eval harness, observability logs                             | stays in git history          |
| Updated dependencies without behavior change                              | stays in git history          |
| Documentation in the repo                                                 | stays in git history          |

Auto-excludes by commit shape (these drop out at the filter step without further consideration):

- Conventional prefixes that live inside the implementation: `chore:`, `ci:`, `test:`, `refactor:`, `style:`, `build:`, `docs:`. (If a `docs:` commit describes a new user-facing feature, describe the feature itself, not the docs.)
- Merge commits — `Merge branch …`, `Merge pull request …` — covered by the underlying commits they merge.
- Bot commits — dependabot, renovate, `*-bot[bot]` — unless they ship a behaviour change worth surfacing on its own.
- Release commits — `release: v…`, `chore: release v…`. The previous release already counted.
- Revert commits paired with their original — if both land in the same range, both drop out.

When a commit mixes user-facing + invisible work (e.g. "add MCP server + refactor tools to registry"), keep the MCP server bullet only. Users got MCP; the refactor was an implementation detail.

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

**Exception — architectural release**: when the entire release is one architectural jump dominated by a single area (like the v0.14.0 "iCloud Sync Improvements" overhaul), use a single area-named section with an intro paragraph + nested bullets instead of forcing it into the type grid. The intro paragraph carries the headline and the bullets carry the parts. See `references/voice.md` for the v0.14.0 example.

### Step 5 — per-section interview (the CORE of this skill)

For **each section** identified in step 4, draft **2-3 distinct phrasing options** and ask the user to pick. Use the `AskUserQuestion` tool. Mark one option as **(Recommended)**.

The options should differ meaningfully — different angle, different structure, not just synonym swaps. For example:

- **Option A — terse**: a single bullet per major outcome.
- **Option B — structured**: an intro paragraph + nested bullets for the parts.
- **Option C — narrative**: a short story of the experience the user gets.

For tiny sections (1 bullet), a single phrasing is enough — just confirm with the user.

Each option must be a complete, paste-ready section. Show the actual final markdown that would land in CHANGELOG.md, so the user is choosing between finished products.

Voice rules for every option:

- Past tense for fixes ("Fixed an issue where…"), present-shaped imperative for new things ("Add custom emoji…").
- Plain English only — commit-syntax prefixes like `feat(...)` stay in git.
- Lead with the OUTCOME the user gets ("Tasks load 4× faster on big lists" is the shape — name the experience, then the cause if needed).
- Use **bold** to anchor each bullet on the most useful word: the feature's name when introducing it, or the area when several bullets need disambiguation.
- One bullet per user-visible outcome. Several commits behind one feature collapse into one bullet.

For the full reference — Apple/Linear/Figma examples, the worked example with a real input-to-output transformation, three house-style example releases, six positive rules with their catches, plus special notations (experimental features, upcoming behavior changes, breaking-changes top-level note) and PR/issue link conventions — open [`references/voice.md`](references/voice.md). Also re-read the 2–3 most recent CHANGELOG entries every time before drafting — voice consistency between releases is what makes the bar feel maintained.

**Check for special situations before assembling.** Ask the user during the interview when any of these apply (most routine releases use none of them):

- **Anything experimental in this release?** A new feature whose shape might still shift — the assistant streaming, MCP server in early days, anything labelled beta or behind a flag. If yes, use the experimental marker pattern from `references/voice.md` §6.
- **Any upcoming behavior changes worth announcing?** A deprecation or breaking switch scheduled for a future version. If yes, add an `### ⚠️ Upcoming behavior changes` section per the same reference.
- **PR or issue links worth attaching to specific bullets?** Mention the option for bullets where the linked discussion adds real context (root-cause analysis, design rationale, tracking issue for feedback). Skip linking on the routine bullets — the link adds noise without signal there.

### Step 6 — version bump interview

Show **all three** options (patch / minor / major) with reasoning, and mark the recommended one. Use `AskUserQuestion`. Reasoning shapes:

| Bump                        | When                                                        | This release qualifies if...                                                                            |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **patch** (0.14.3 → 0.14.4) | Only bug fixes + invisible refactors                        | Every section is 🐛 Bug Fixes                                                                           |
| **minor** (0.14.3 → 0.15.0) | New user-facing features without breaking                   | Any section adds new capability (AI, MCP, new UI)                                                       |
| **major** (0.14.3 → 1.0.0)  | Breaking changes — data shape, settings keys, external APIs | Schema migration drops a field, removed a setting users may have configured, changed an export contract |

Let the user override the recommendation — they know intent you can't infer.

### Step 7 — pre-flight verification

Run every gate before invoking the script. A red gate post-tag means a hotfix and a wasted version number.

```bash
pnpm check:all
```

That runs lint + typecheck (main / render / shared) + circular + tests. If any gate fails, STOP, report the failure, and ask the user how to proceed — fixing first is the usual answer; shipping anyway requires an explicit override from the user.

**About test failures:** the project may have pre-existing test failures unrelated to current changes (you've seen baselines like "11 failed / 68 passed" as a stable baseline). Treat those as the bar — what matters is that the baseline didn't worsen. Compare against `main` if needed.

### Step 8 — assemble and confirm the final text

Stitch the selected per-section options together with:

- `## v${nextVersion} - ${YYYY-MM-DD}` header
- One blank line
- Each chosen section in order
- `---` separator at the end

Show the full text to the user one more time. Print it as a single markdown block. Then ask:

> "Шипим v${nextVersion} с этим текстом? (yes/no/edit)"

- `yes` → step 9
- `no` → STOP and stay out of the git/tag/push side until the user comes back.
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

- **Huge squashed commits.** A single commit body lists 8 phases of work and 100+ files. Read the body and pull each user-facing phase into its own bullet — one bullet per outcome, not one bullet per commit. Internal phases (refactors, test additions) flow off via the filter at step 3.
- **No `## [Unreleased]` placeholder.** The script falls back to inserting after `# Changelog` automatically — proceed as usual.
- **Multiple features that touch the same area.** Group them under one section heading even if they came from different phases. The user reads by topic, not by phase.
- **One ambiguous commit.** When the subject/body/diff leave it unclear whether a change is user-facing, ask the user. One extra question is cheaper than a wrong inclusion.
- **CHANGELOG style drift.** Match the most recent 2-3 entries. If they're terse, stay terse. If they use structured intros, use structured intros for similarly-sized scope.
- **User says "skip the interview, just draft it."** Produce a single best-effort draft and ask for revisions in chat. The per-section AskUserQuestion flow is the default, but opting out is fine when the user prefers it.
- **Auto-update artifacts.** `pnpm release` only tags. Building/publishing the .dmg lives in CI or a separate step. If the user expects the release to be in the App Store / auto-update channel immediately, point out the missing build step so they can run it next.

## Skill boundary

This skill produces the CHANGELOG entry + version + script invocation. Marketing copy, App Store metadata beyond the CHANGELOG, deciding whether a change is worth shipping, bypassing pre-flight gates, and pushing without approval at step 8 all stay outside the boundary — they belong to the user's judgement.
