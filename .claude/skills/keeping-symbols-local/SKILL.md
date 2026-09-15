---
name: keeping-symbols-local
description: Use when about to `export`, hoist, or extract a type, composable, constant, helper, or sub-component that has only one use site — e.g. a union used by a single component, or a lookup table read by one function. Decides whether a symbol stays inside its function, stays in its file, earns an export and its own file, or gets promoted to a shared folder.
---

# Keeping Symbols Local

A **symbol** is any named declaration — a type, composable, constant, helper, or sub-component. This skill governs one decision: how far a symbol should be visible. The default is _as little as possible_.

Renderer paths below are relative to `apps/desktop/src/renderer/src` — the `@/` alias.

## Core rule

**Keep every symbol at the lowest reach its actual use requires.** A symbol used in exactly one place is declared in that place and is not exported. What promotes it up a rung is a **real second consumer** that exists right now — never anticipation that one might.

`export` is a claim that something else uses this. Extracting to its own file is the same claim in folder form, and hoisting a value to module level is the same claim inside a file. Making that claim for a single-use symbol is a lie the next reader has to disprove: they must go looking for the other readers that aren't there.

## The reach ladder

Every symbol sits on one rung. Start at the bottom; a symbol climbs one rung the moment a genuine consumer on the next rung appears.

- **Rung 0 — inside the function.** Read by one function. Declare it there, or return the literal straight from it and let the type be inferred. `crossFadeFor` in `ui/modules/CalendarDock/composables/useDockCrossFade.ts` returns its keyframes and timings inline — no `type CrossFade`, no `const CROSS_FADE` beside it. The one exception is a type the function's own signature needs, such as the options object of a composable: it is declared unexported at module level, right above the function (`type DragScrollOptions = {…}`).
- **Rung 1 — file-local.** Read by several functions of one `.ts` or one `.vue`. Module level, unexported. A union used only inside one component lives in that `<script setup>`.
- **Rung 2 — folder-local.** Two or more files _inside the same component folder_ share it. Now it earns `types.ts` / `constants.ts` / `composables/useXxx.ts` with `export` — but it stays inside the folder and is **not** re-exported from the component's `index.ts`. A one-off `useXxx.ts` sits flat next to the `.vue` (`ui/base/BaseContextMenu/{fragments}/MenuPanel/useSubmenuNavigation.ts`). Anchors: `ui/base/BaseContextMenu/types.ts`, `ui/base/BaseModal/types.ts`.
- **Rung 3 — renderer-shared.** A _second component_ needs it. Only now does it leave the folder, to its shared home: `utils/<domain>/`, `composables/`, `types/`, `constants/`, `ui/common/<group>/`, or `ui/base/`.
- **Rung 4 — cross-boundary.** Main and renderer both need it → `apps/desktop/src/shared/`. Core or the server needs it too → `packages/std` (domain-free helpers) or `packages/protocol` (rules over the synced domain).

Two private copies of the same function are two readers, not two symbols: merge them into one declaration on the rung both readers need — the identical `messageOf` in `ProviderMigrationModal.vue` and its fragment `ServerConnectSteps.vue` becomes `ProviderMigrationModal/utils/messageOf.ts`.

One real new consumer moves a symbol up exactly one rung. You never skip rungs on speculation, and you never widen reach "to be safe."

## Example

```ts
// ❌ StatusBadge is the only user, yet the union and the table each got a file and an export
// StatusBadge/types.ts
export type StatusTone = "idle" | "syncing" | "error"
// StatusBadge/constants.ts
export const TONE_CLASSES: Record<StatusTone, string> = {idle: "text-base-content/60", syncing: "text-accent", error: "text-error"}
```

```vue
<!-- ✅ one use site → declared in the component; the table lives inside the one function that reads it -->
<!-- StatusBadge.vue -->
<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

type StatusTone = "idle" | "syncing" | "error"

defineProps<{tone: StatusTone}>()

function getBadgeClasses(tone: StatusTone) {
  return cn("rounded px-1.5 text-xs", {idle: "text-base-content/60", syncing: "text-accent", error: "text-error"}[tone])
}
</script>
```

## Why keep reach low

- **Honest surface.** An `export`, a standalone file, or a module-level constant says "shared." When it isn't, every reader wastes effort confirming the reach is fake.
- **Free to change.** An inline, unexported symbol has exactly one reader to update. The moment it's exported you must assume unknown callers and refactoring gets heavier.
- **Reuse is discovered, not predicted.** The shape a symbol needs to be shared is rarely the shape it had at its first site. Extracting on the _second_ real use lets the actual requirement — not a guess — drive the interface.

## Common mistakes

- Adding `export` to a type/const/helper that only its own file uses. Drop the keyword.
- Keeping a parameter nobody passes, or a returned member nobody reads, "for later". It has zero consumers — remove it, and its type with it.
- Keeping a variant value nobody passes (`size: "lg"`, `variant: "link"`) in `variants.ts` or a props union. It goes like an unpassed prop; a prop left with a single value goes too, and its value becomes the literal.
- Keeping a component nothing imports. Delete the file; git has it.
- Writing a composable or helper generically — callbacks, generic type parameters, an options bag — when it has one caller. Specialise it to that caller: it calls the API or store itself and fixes what the only caller would pass (`useSearch()` calls `API.searchTasks`, not `useSearch({searchFn})`). Generalise on the second real caller.
- Hoisting a lookup table and its type to module level when one function reads them. Inline both into that function.
- Giving a component a `types.ts` / `constants.ts` / `composables/` file for a symbol only the `.vue` itself touches. Declare it inline until a second file in the folder needs it.
- Promoting a single-use `{fragments}/` child or `useXxx` to `ui/common/` / `composables/` / `utils/` because it "might" be reused. Wait for the second caller.
- Lifting a renderer-only type into `apps/desktop/src/shared/` or `packages/*`. Those homes are for symbols that really cross the process or package boundary.
- Re-exporting a folder-local type from the component's public `index.ts`. The door exposes the component, not its internals.
- Treating a big or "important-looking" symbol as automatically shared. Size and importance don't set reach — the number of real consumers does.

## See also

This skill decides **whether** to widen a symbol's reach. Once a symbol has genuinely earned promotion, its destination and file shape are governed by `structuring-components` (component folders, `{fragments}/`, `index.ts`), `structuring-utility-files` (one-function files under `utils/`), and `writing-types` (`type` vs `interface`).
