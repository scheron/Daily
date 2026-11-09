---
name: keeping-symbols-local
description: Use when, in TypeScript/Vue code, about to `export`, hoist or extract a type, composable, constant, helper or sub-component — especially one with a single use site, such as a union used by one component or a lookup table read by one function. Decides whether a symbol stays inside its function, stays in its file, earns an export and a file inside its owner's folder, or is promoted to a shared folder.
---

# Keeping Symbols Local

A **symbol** is any named declaration — a type, composable, constant, helper or sub-component. This skill governs one decision: how far a symbol is visible. The default is _as little as possible_.

Renderer paths below are relative to `apps/desktop/src/renderer/src` — the `@/` alias.

## Core rule

**Keep every symbol at the lowest reach its actual use requires.** A symbol used in exactly one place is declared in that place and is not exported. What promotes it up a rung is a **real consumer on the next rung** that exists right now — never anticipation that one might.

A real second consumer is necessary but not sufficient: extract only a meaningful domain policy, effect or lifecycle. A transparent one-line query is written with native operations where it is needed — `items.find((item) => item.id === id)` — instead of a shared wrapper.

`export` is a claim that something else uses this. Extracting to its own file is the same claim in folder form, and hoisting a value to module level is the same claim inside a file. Making that claim for a single-use symbol is a lie the next reader has to disprove: they go looking for readers that aren't there.

### Visibility is not responsibility

This skill sets how far a symbol is visible. Whether behaviour belongs to the View, a workflow or a UI mechanism is decided by the responsibility guide of **writing-composables**. A workflow or a UI mechanism with one caller still earns its composable in the owner's `composables/`; a simple view-only interaction stays in its View. An extracted composable carries an `export` for its owner only, stays owner-local, and climbs the ladder like any other symbol.

## The reach ladder

Every symbol sits on one rung. Start at the bottom; one real new consumer moves it up exactly one rung.

- **Rung 0 — inside the function.** Read by one function: declare it there, or return the literal straight from it and let the type be inferred. `crossFadeFor` in `ui/modules/CalendarDock/composables/useDockCrossFade.ts` returns its keyframes and timings inline — no `type CrossFade`, no `const CROSS_FADE` beside it. The one exception is a type the function's own signature needs, such as a composable's options object: it sits unexported at module level, right above the function (`type DragScrollOptions = {…}`). Regex literals live in `constants/regex.ts` (**naming-files**).
- **Rung 1 — file-local.** Read by several functions of one `.ts` or one `.vue`: module level, unexported. A union or a class map used only inside one component lives in its `<script setup>`.
- **Rung 2 — owner-local.** Two or more files inside one component folder share it, or the responsibility guide extracts it from the `.vue`. Now it earns `types.ts`, `constants.ts`, `composables/useXxx.ts` or `utils/xxx.ts`, with `export`. A composable always goes to `composables/`, even when it is the only one — never flat beside the `.vue`. These exports stay inside the folder and are not re-exported from its `index.ts`, unless they form the owner's actual public contract. Anchors: `ui/base/BaseContextMenu/types.ts`, `ui/base/BaseModal/types.ts`.
- **Rung 3 — renderer-shared.** An independent owner — a _second component_ — needs it. Only now does it leave the folder, to the home its kind has: mutable reactive state and registries to a store in `stores/`, static catalogs to `constants/`, loaders, queries and transforms to `utils/<domain>/`, shared types to `types/`, composables to `composables/`, components to `ui/common/(<group>)/` or `ui/base/`. A shared domain contract never lives in a UI component.
- **Rung 4 — cross-boundary.** Main and renderer both need it → `apps/desktop/src/shared/`. Core or the server needs it too → `packages/std` (domain-free helpers) or `packages/protocol` (rules over the synced domain). Only symbols that really cross the boundary go there.

Two private copies of the same function are two readers, not two symbols: merge them into one declaration on the rung both readers need. The identical `messageOf` in `ProviderMigrationModal.vue` and its fragment `ServerConnectSteps.vue` becomes `ProviderMigrationModal/utils/messageOf.ts`. Variant class maps belong to their component (**structuring-components**).

You never skip rungs on speculation, and you never widen reach "to be safe".

### Types through a door

A type goes through a component's `index.ts` only once something outside the folder imports it; a Base component's door exports its props type for its callers. Where a type is declared and how it is named is **writing-types**' call.

## Example

```ts
// WRONG — StatusBadge is the only user, yet the union and the table each got a file and an export
// StatusBadge/types.ts
export type StatusTone = "idle" | "syncing" | "error"
// StatusBadge/constants.ts
export const TONE_CLASSES: Record<StatusTone, string> = {idle: "text-base-content/60", syncing: "text-accent", error: "text-error"}
```

```vue
<!-- RIGHT — one use site: the union is declared in the component, the class literals inside the one computed that reads them -->
<!-- StatusBadge.vue -->
<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

type StatusTone = "idle" | "syncing" | "error"

const props = defineProps<{tone: StatusTone}>()

const badgeClass = computed(() =>
  cn("rounded px-1.5 text-xs", {
    "text-base-content/60": props.tone === "idle",
    "text-accent": props.tone === "syncing",
    "text-error": props.tone === "error",
  }),
)
</script>

<template>
  <span :class="badgeClass"><slot /></span>
</template>
```

## Why keep reach low

- **Honest surface.** An `export`, a standalone file or a module-level constant says "shared". When it isn't, every reader wastes effort confirming the reach is fake.
- **Free to change.** An inline, unexported symbol has exactly one reader to update. Once it is exported, unknown callers have to be assumed and every refactor gets heavier.
- **Reuse is discovered, not predicted.** The shape a symbol needs to be shared is rarely the shape it had at its first site. Extracting on the _second_ real use lets the actual requirement — not a guess — drive the interface.

## Common mistakes

- Adding `export` to a type, constant or helper that only its own file uses. Drop the keyword.
- Keeping a parameter nobody passes, or a returned member nobody reads, "for later". It has zero consumers: remove it, and its type with it.
- Keeping a variant value nobody passes (`size: "lg"`, `variant: "link"`) in `variants.ts` or a props union. It goes like an unpassed prop; a prop left with a single value goes too, and its value becomes the literal.
- Keeping a component nothing imports. Delete the file; git has it.
- Writing a composable or helper generically — callbacks, generic type parameters, an options bag — when it has one caller. Specialise it to that caller: it calls the API or the store itself and fixes what the only caller would pass (`useSearch()` calls `API.searchTasks`, not `useSearch({searchFn})`). Generalise on the second real caller.
- Hoisting a lookup table and its type to module level when one function reads them. Inline both into that function.
- Giving a component a `types.ts` or `constants.ts` for a symbol only the `.vue` itself touches. Declare it inline until a second file in the folder needs it.
- Putting an extracted composable flat beside the `.vue` because it is the only one. It goes to the owner's `composables/`.
- Promoting a single-use `{fragments}/` child or `useXxx` to `ui/common/`, `composables/` or `utils/` because it "might" be reused. Wait for the second caller.
- Promoting a transparent one-line query on its second caller. Write the native operation in both places.
- Lifting a renderer-only type into `apps/desktop/src/shared/` or `packages/*`. Those homes are for symbols that really cross the process or package boundary.
- Re-exporting a folder-local type from the component's public `index.ts`. The door exposes the component, not its internals.
- Exporting a symbol, or widening a door, only so a test can reach it.
- Making an unrelated UI component's file the shared home of a type or helper.
- Treating a big or "important-looking" symbol as automatically shared. Size and importance don't set reach — the number of real consumers does.

## Done when

Every extracted or exported symbol has an actual consumer at that reach, every component's non-presentation logic has its owner, and nothing borrows an unrelated UI module as its shared home.

## See also

This skill decides **whether** a symbol's reach widens. Once a symbol has earned promotion, its destination and file shape are governed by **structuring-components** (component folders, `{fragments}/`, `composables/`, `index.ts`), **structuring-utility-files** (one-function files under `utils/`), **writing-types** (where a type lives, `type` versus `interface`) and **writing-composables** (the responsibility guide).
