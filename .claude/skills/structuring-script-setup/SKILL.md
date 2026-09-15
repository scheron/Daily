---
name: structuring-script-setup
description: Use when writing or reordering the `<script setup>` block of a Vue SFC — deciding where imports, types, constants, props/emits, module state, stores, refs, computeds, composables, methods, watchers, lifecycle hooks, and defineExpose belong. Applies whenever you add a ref, store, computed, watcher, or lifecycle hook and need its position, or a component's sections are interleaved.
---

# Structuring `<script setup>`

## Core principle

Sections inside `<script setup>` follow **one fixed order**, top to bottom, and never interleave. The order mirrors the dependency flow — stores feed refs and computeds, computeds feed methods, methods feed watchers, and watchers plus lifecycle close the file. A uniform shape makes any component scannable: you always know where state lives, where effects live, where lifecycle lives.

> This skill governs the **order inside a single `<script setup>`**, and the same order inside a composable's body. For the **folder/file layout** of a component, how composables take their inputs, and how `:class` is bound, see **structuring-components**. The SFC blocks themselves are lint-ordered: `<script setup>`, then `<template>`, then `<style>`. The block always opens as `<script setup lang="ts">`, and it is the component's only script block: state shared by every instance (a `MarkdownIt` renderer) goes to a `.ts` file next to the component, which then earns its folder.

## The canonical order

1. **Imports** — arranged by `@ianvs/prettier-plugin-sort-imports` (`prettier.config.js`): `vue` → `vue-*` → `@vueuse/*` → third-party; then `@daily/*`; then `@/…` and relative; `import type` last, as separate statements (ESLint `consistent-type-imports`). Let Prettier arrange, don't hand-order.
2. **Types** — component-local `type` aliases / unions (e.g. `UndoPhase`). Above constants.
3. **Constants** — component module constants with **more than one reader** (e.g. `UNDO_WINDOW_MS`). A value one function reads lives inside that function (**keeping-symbols-local**).
4. **`defineProps` / `defineEmits`** — the component contract. Emit one way per component: once `const emit = defineEmits(...)` exists, the template calls `emit(...)` too, not `$emit(...)`.
5. **Module-mutable state** — plain `let` flags/handles (`let suppressCommit = false`, `let tickTimer = 0`).
6. **Stores** — Pinia stores (`useTasksStore()`) and the router's injectables (`useRoute()`, `useRouter()`).
7. **Refs** — `ref()`, and template refs through `useTemplateRef`. The key names the element without a `Ref` suffix and matches `ref=""`; the variable carries the suffix: `const panelRef = useTemplateRef<HTMLElement>("panel")` with `ref="panel"`.
8. **Computeds** — `computed()`.
9. **Composables / derived reactive state** — `useElementSize()`, `useDockTabs()`, `useBoardDrop()` — anything returning reactive state or registering its own effects, including synchronous `window.BridgeIPC["…"](callback)` subscriptions.
10. **Methods** — plain functions, including `get<Part>Classes(...)`.
11. **Watchers** — `watch()`, `watchEffect()`, `watchDebounced()`.
12. **Lifecycle hooks** — `onMounted()`, `onBeforeUnmount()`, …
13. **`defineExpose`** — dead last.

## Reference

`reference/Correct.vue` and `reference/Incorrect.vue` are the **same component** shown right and wrong — diff them. `Correct.vue` carries `// N. section` labels **for teaching only**; real components omit them (**writing-comments**) and rely on a blank line between sections. `Incorrect.vue` annotates each misplacement with `// ❌`.

`ui/modules/CalendarDock/CalendarDock.vue` is a live component in this shape: imports, stores, template ref, composables, then `getTabClasses`.

## How to apply

- **Blank line between every section** — each reads as its own paragraph. Don't scatter watchers between methods, don't drop `onMounted` mid-file, don't hoist `defineExpose`.
- **Deviate only when a real dependency forces it.** The usual case: a composable whose reactive output a computed consumes gets hoisted up to sit just above that computed — the dependency wins over the slot. Everything else stays put.
- **Keep `let` module state (5) together near the top** even if only lifecycle reads it — don't strand a `let tickTimer` down beside `onMounted`.
- **No comments** in the block — the order plus blank lines carry the structure.

## Inside a composable

A `useXxx.ts` follows the same order from §6 down: stores → refs → computeds → the composables it calls → functions → watchers → lifecycle hooks → `return`. Module-level types and constants sit above the `export function`, per **keeping-symbols-local**. Anchor: `ui/modules/CalendarDock/composables/useDockCrossFade.ts`.

## Common mistakes

- Interleaving: a `ref` among methods, a `watch` between two computeds, a lonely constant mid-file.
- `defineExpose` anywhere but the very end.
- Splitting a paired `onMounted` / `onBeforeUnmount` across the file.
- Putting stores below refs, or types/constants below props.
- A template ref as `ref<HTMLElement | null>(null)` instead of `useTemplateRef<HTMLElement>("name")`.
- A `Ref` suffix inside the key — `useTemplateRef("panelRef")`. The key is the element's name: `"panel"`.
- `<script lang="ts" setup>` — the attributes go `setup lang="ts"`.
- A second, non-setup `<script lang="ts">` block for module-level state. Move that state into a `.ts` beside the component.
- `$emit("close")` in the template next to `emit("done")` in the script. Pick `emit` for both.
- A module constant with a single reader. Inline it.
- Adding section-label comments to real components — the order plus blank lines carry it; labels live only in the reference file.
