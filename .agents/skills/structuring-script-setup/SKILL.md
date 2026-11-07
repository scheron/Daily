---
name: structuring-script-setup
description: Use when writing or reordering the `<script setup>` block of a Vue SFC — deciding where imports, types, constants, props/emits/model, instance state, stores and app services, refs and template refs, computeds, composables, methods, watchers and subscriptions, lifecycle hooks, and defineExpose belong. Applies whenever you add a ref, store, computed, watcher, event subscription, or lifecycle hook and need its position, or a component's sections are interleaved.
---

# Structuring `<script setup>`

Vue only.

## Core principle

Sections inside `<script setup>` follow **one fixed order**, top to bottom, and never interleave. The order mirrors the dependency flow — stores feed refs and computeds, computeds feed methods, methods feed watchers and subscriptions, and lifecycle closes the file. A uniform shape makes any component scannable: you always know where state lives, where effects live, where lifecycle lives.

> This skill governs the **order inside a single `<script setup>`**, and the same order inside a composable's body. For the **folder and file layout** of a component — where `composables/`, `utils/`, `{fragments}/` and `index.ts` belong — and how `:class` is bound, see **structuring-components**. How a composable is named and takes its inputs: **writing-composables**.
>
> The SFC blocks are lint-ordered: `<script setup>`, then `<template>`, then `<style>`. The block opens as `<script setup lang="ts">`, and it is the component's only script block: state shared by every instance goes to the component's `state.ts`, a companion that earns the component its folder (**structuring-components**).

## The canonical order

1. **Imports** — arranged by `@ianvs/prettier-plugin-sort-imports` (`prettier.config.js`): `vue` → `vue-*` → `@vueuse/*` → third-party; then `@daily/*`; then `@/…` and relative; `import type` last, as separate statements (ESLint `consistent-type-imports`). Let Prettier arrange, don't hand-order.
2. **Types** — component-local `type` aliases and unions (`UndoPhase`). Above constants.
3. **Constants** — component module constants with **more than one reader** (`UNDO_WINDOW_MS`). A value one function reads lives inside that function (**keeping-symbols-local**).
4. **Contract** — `defineProps` (or `withDefaults(defineProps<…>(), {…})`), `defineEmits`, `defineModel`. Emit one way per component: once `const emit = defineEmits(...)` exists, the template calls `emit(...)` too, not `$emit(...)`.
5. **Instance state** — plain, non-reactive `let` flags and handles (`let suppressCommit = false`, `let tickTimer = 0`). A `let` here is created anew for every instance of the component; state every instance shares lives in its `state.ts`.
6. **Stores and app services** — Pinia stores (`useTasksStore()`) with their `storeToRefs`, the router's injectables (`useRoute()`, `useRouter()`), and app-level services (`useToasts()`).
7. **Refs** — `ref()`, and template refs through `useTemplateRef`. The key names the element without a `Ref` suffix and matches `ref=""`; the variable carries the suffix: `const panelRef = useTemplateRef("panel")` with `ref="panel"`. Vue's language tools infer the element type from the template.
8. **Computeds** — `computed()`, including a styled part's `<part>Class`, with object or array syntax inside `cn` (**structuring-components**).
9. **Composables** — `useElementSize(panelRef)`, `useDockTabs()`, `useBoardDrop()` — anything returning reactive state or handles, or registering its own effects. A subscription whose callback is written inline sits here too: `useEventListener(document, "visibilitychange", () => (nowMs.value = Date.now()))`, or a synchronous `window.BridgeIPC["…"]((value) => …)` subscription.
10. **Methods** — plain functions, including `get<Part>Classes(item)` for a value that comes from a loop (**structuring-components**).
11. **Watchers and subscriptions** — `watch()`, `watchEffect()`, `watchDebounced()`, and a subscription that passes a named handler: `useEventListener(window, "keydown", onKeydown)`. It depends on a method, so it sits below the methods.
12. **Lifecycle hooks** — `onMounted()`, `onBeforeUnmount()`, …, and the component's initial async load (`invoke(async () => { … })` from VueUse, or an async `onMounted`).
13. **`defineExpose`** — dead last.

## What stays in the component

The order arranges what the component keeps: its UI. Template refs, local disclosure and focus state, display computations and rendering effects stay here; workflow state and logic with a clear responsibility of their own live in the component's composables (**writing-composables**). Decide by responsibility, not by the presence of a ref, watcher, lifecycle hook or timer, and never move a whole script elsewhere just to satisfy this order.

## Reference

`reference/Correct.vue` and `reference/Incorrect.vue` are the **same component** shown right and wrong — diff them. The pair is an isolated teaching example of ordering only; in real code place each state transition or effect by its responsibility. `Correct.vue` carries `// N. section` labels **for teaching only**; real components omit them (**writing-comments**). `Incorrect.vue` annotates each misplacement with `// ❌`.

`ui/modules/CalendarDock/CalendarDock.vue` is a live component in this shape: imports, stores, template ref, composables, then methods.

## How to apply

- **Blank lines separate sections, not declarations.** Keep related short declarations together: refs in one block, computeds in another, a store next to its `storeToRefs`. Do not insert a blank line after every variable. A distinct concern or a substantial multiline expression may earn its own block. Keep methods, watchers and lifecycle visually separate; don't scatter watchers between methods, don't drop `onMounted` mid-file, don't hoist `defineExpose`.
- **Deviate only when a real dependency forces it.** The usual case: a composable whose reactive output a computed consumes (`useNow` feeding a countdown computed, `isLoading` from a loading wrapper feeding a `disabled` computed) moves up to sit just above that computed — the dependency wins over the slot. A subscription follows the same rule: with a named handler it sits below the methods, with an inline callback it stays with the composables. Everything else stays put.
- **Keep instance state (5) together near the top** even if only lifecycle reads it — don't strand a `let tickTimer` down beside `onMounted`.
- **No section labels in real code** — the order plus blank lines carry the structure. A comment is for a why the code cannot show (**writing-comments**).

## Inside a composable

A `useXxx.ts` follows the same order from slot 5 down: instance state, the `let` values created anew on every call → stores and app services → refs → computeds → the composables it calls → functions → watchers and subscriptions → lifecycle hooks → `return`. Module-level types and constants sit above the `export function`, per **keeping-symbols-local**. Anchor: `ui/modules/CalendarDock/composables/useDockCrossFade.ts`.

## Common mistakes

- Interleaving: a `ref` among methods, a `watch` between two computeds, a lonely constant mid-file.
- `defineExpose` anywhere but the very end.
- Splitting a paired `onMounted` / `onBeforeUnmount` across the file.
- Putting stores below refs, or types and constants below the contract.
- `defineModel` declared away from `defineProps` and `defineEmits`.
- Calling `useRouter()` or `useToasts()` halfway down, next to the method that first needs them. They belong with the stores (6).
- Registering a subscription above the named handler it passes.
- An inline-callback subscription parked among the watchers — it passes no method and sits with the composables (9).
- A template ref as `ref<HTMLElement | null>(null)` instead of `useTemplateRef("panel")`.
- A `Ref` suffix inside the key — `useTemplateRef("panelRef")`. The key is the element's name: `"panel"`.
- `<script lang="ts" setup>` — the attributes go `setup lang="ts"`.
- A second, non-setup `<script lang="ts">` block for module-level state. Move that state into the component's `state.ts`.
- `$emit("close")` in the template next to `emit("done")` in the script. Pick `emit` for both.
- A module constant with a single reader. Inline it.
- Adding section-label comments to real components — labels live only in the reference files.
