# CLAUDE.md

**Daily** — local-first macOS task manager. Electron main + Vue 3 renderer + a shared, Electron-free storage core (`src/main/storage/createStorageCore.ts`) that also powers a CLI (`src/cli/`, `@scheron/daily-cli`). SQLite is the source of truth; sync is local-first multi-remote (iCloud / folder / SSH) with Last-Write-Wins.

## Commands

```bash
pnpm dev                 # dev server, hot reload
pnpm build               # package macOS .dmg
pnpm typecheck:all       # main + renderer + shared + cli — run before committing
pnpm lint                # ESLint --fix
pnpm test                # full vitest suite (Electron runtime via evitest)
pnpm check:all           # lint + typecheck:all + circular + test
```

## Architecture

- **Layers:** Model (SQLite CRUD, `_rowMappers` maps snake_case↔camelCase) → Service (business logic) → Controller (`StorageController`) → IPC → renderer store → component.
- **Renderer↔main is exclusively `window.BridgeIPC`** (preload + contextBridge). No fs/electron in the renderer.
- **AI** (`src/main/ai/`): agent loop with `Before/AfterToolCall` hooks; destructive tools suspend for user confirmation; only the `respond` tool is user-visible.

## Conventions (enforced)

- **Public-before-private:** public methods/exports first, private/helpers last; constructor after fields.
- **No inline comments.** JSDoc only where it earns it: public methods/props, function/composable `@param`, component props, pure utils (`@example`).
- **Errors** live in `src/shared/errors/<domain>/` — one file per `Error` subclass; inline throws use enum codes there.
- **`type` over `interface`** (reserve `interface` for shapes a class implements).
- **Locality:** types/constants at the narrowest scope; lift to `src/shared/` only when crossing the process boundary.
- **CHANGELOG:** App Store-style, impersonal (no "you"), type-based sections. See `.claude/skills/release-daily/`.

## Gotchas

- **Soft deletes only** — set `deletedAt`, never hard-delete. Tasks are always scoped to a branch (`main` always exists).
- **Snapshot version:** on any change to the sync snapshot shape, bump `Snapshot.version` in `src/main/types/sync.ts` and handle older versions on read (a newer version aborts sync via `SnapshotVersionAheadError`).
- **Tailwind stays in devDependencies** — as a prod dep it drags Rust natives into the asar.
- macOS/arm64 only; Node ≥ 22.5.0, pnpm ≥ 10.12.1.
