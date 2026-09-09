# CLAUDE.md

**Daily** ships as a pnpm workspace of six packages: the app (`apps/desktop`), the sync server (`apps/server`), the website (`apps/website`), and three Electron-free shared packages (`packages/core`, `packages/protocol`, `packages/std`). The app is a local-first macOS task manager — Electron main + Vue 3 renderer, built on `packages/core`'s storage core (`packages/core/src/storage/createStorageCore.ts`). SQLite is the source of truth; sync is local-first multi-remote (off, iCloud, or a self-hosted server) with Last-Write-Wins.

## Commands

```bash
pnpm dev                              # dev server, hot reload
pnpm --filter @daily/desktop build    # package macOS .dmg
pnpm --filter @daily/server build     # bundle the sync server
node scripts/release.js --status      # what each artifact has pending since its own tag
node scripts/release.js               # survey both, then ask which to release
node scripts/release.js app           # release the app (--dry-run supported)
node scripts/release.js server        # release the server (--dry-run supported)
pnpm typecheck:all       # every package — run before committing
pnpm lint                # ESLint --fix
pnpm test                # full vitest suite (Electron runtime via evitest)
pnpm check:all           # lint + typecheck:all + circular + test
```

## Environment

**Build.** `pnpm --filter @daily/desktop build` — packages the macOS `.dmg`. `pnpm --filter @daily/server build` — bundles the sync server.
**Typecheck.** `pnpm typecheck:all`
**Lint.** `pnpm lint`
**Tests.** `pnpm test` — vitest under the Electron runtime.
**Single test file.** `pnpm evitest run packages/core/tests/storage/sync/convergence.test.ts`
**Dev server.** `pnpm dev` — opens the Electron window, no URL.
**E2E.** none
**Runtime.** The app is driven through its Electron window (`pnpm dev`). The server runs as the `ghcr.io/scheron/daily-server` image, or from the package `pnpm build:server:package` emits — `cd apps/server/dist-server && npm install --omit=dev && node index.js start`. That install is not optional: the workspace's `better-sqlite3` is built for Electron's ABI, so a plain `node` cannot load the bundle.

**bootstrap.** `pnpm install` (`apps/desktop`'s `postinstall` runs `electron-builder install-app-deps`)
**link.** `.env`

## Architecture

- **Layers:** Model (SQLite CRUD, `_rowMappers` maps snake_case↔camelCase) → Service (business logic) → Controller (`StorageController`) → IPC → renderer store → component.
- **Renderer↔main is exclusively `window.BridgeIPC`** (preload + contextBridge). No fs/electron in the renderer.
- **AI** (`apps/desktop/src/main/ai/`): agent loop with `Before/AfterToolCall` hooks; destructive tools suspend for user confirmation; only the `respond` tool is user-visible.

## Conventions (enforced)

- **Public-before-private:** public methods/exports first, private/helpers last; constructor after fields.
- **No inline comments.** JSDoc only where it earns it: public methods/props, function/composable `@param`, component props, pure utils (`@example`).
- **Errors** live in `apps/desktop/src/shared/errors/<domain>/` — one file per `Error` subclass; inline throws use enum codes there.
- **`type` over `interface`** (reserve `interface` for shapes a class implements).
- **Locality:** types/constants at the narrowest scope; lift to `apps/desktop/src/shared/` only when crossing the process boundary.
- **CHANGELOG:** App Store-style, impersonal (no "you"), type-based sections. See `.claude/skills/release-daily/`.

## Gotchas

- **Soft deletes only** — set `deletedAt`, never hard-delete. Tasks are always scoped to a branch (`main` always exists).
- **Snapshot version:** on any change to the sync snapshot shape, bump `Snapshot.version` in `packages/protocol/src/types/sync.ts` and handle older versions on read (a newer version aborts sync via `SnapshotVersionAheadError`).
- **Tailwind stays in devDependencies** — as a prod dep it drags Rust natives into the asar.
- macOS/arm64 only; Node ≥ 24.0.0, pnpm ≥ 10.26.0.
