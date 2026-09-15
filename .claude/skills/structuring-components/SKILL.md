---
name: structuring-components
description: Use when creating, moving, splitting, or refactoring a Vue component under the renderer's `ui/`, or when deciding where a component's composable, util, constant, type, or child sub-component belongs. Also applies whenever you write a `:class` binding that depends on state, a composable a component calls, or a `<template>` element whose text is a `{{ }}` interpolation.
---

# Structuring Components (Fractal Architecture)

Paths below are relative to the renderer root `apps/desktop/src/renderer/src` — the `@/` alias.

## Core principle

Component folders are **fractal**: every component folder has the same shape, and a child (a "fragment") is just a smaller component with that _same_ shape, nested one level deeper. There is no special top-level layout — the pattern recurses all the way down.

> This skill governs the **folder/file layout** of a component, how its composables take their inputs, and how its `<template>` binds classes and breaks across lines. For the order of sections _inside_ `<script setup>` see **structuring-script-setup**; for comments see **writing-comments**.

## Categories under `ui/`

| Folder            | Holds                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `base/`           | generic primitives with no app knowledge — `BaseButton`, `BaseModal`, `BasePopup`           |
| `common/<group>/` | app widgets used in several places, grouped by subject — `milestones/`, `pickers/`, `misc/` |
| `modules/`        | the big blocks of the main screen — `TaskBoard`, `CalendarDock`, `RightPanel`, `Header`     |
| `overlays/`       | modals, popups and banners over the app — `SearchModal`, `ConfirmPopup`, `UpdateBanner`     |
| `views/`          | whole screens — `Main`, `Settings`, `Assistant`                                             |

A primitive lives in `base/` for what it is — a checkbox, a resize handle — even when one component uses it (`BaseCheckbox` inside `BaseCombobox`). The one-consumer rule of **keeping-symbols-local** moves app widgets and fragments, not primitives.

## A folder is earned, not the default

**The default form of a component is a single `.vue` file, not a folder.** A lone component lives flat in its category folder — for example `ui/common/milestones/MilestoneDiamond.vue`. No folder, no `index.ts`.

A component **graduates into its own folder** the moment it grows a **companion** — any of:

- a `composables/` or a flat `useXxx.ts`
- a `utils/` or a pure helper file
- a `types.ts` / `constants.ts` / `variants.ts`
- a `{fragments}/` child component
- a second public `.vue` (`BaseModal.vue` + `BaseModalProvider.vue`)

At that point — and only then — it gets a folder plus an `index.ts` barrel to be the folder's public door. Until then, wrapping it adds a directory and a re-export file that carry nothing.

```
WRONG — a folder that holds nothing but the component
  UpdateBanner/
    UpdateBanner.vue
    index.ts        // ← re-exports the one file next to it; pure ceremony

RIGHT — lone component sits flat in its category folder
  overlays/UpdateBanner.vue
```

The `index.ts` exists to be the door to a folder. No companions → no folder → no door, and none is needed. When a flat component later grows its first companion, promote it into a folder then.

## Anatomy of a component folder (once it has earned one)

```
CalendarDock/
  index.ts              // export {default} from "./CalendarDock.vue"
  CalendarDock.vue
  constants.ts          // constants shared by several files of this folder
  types.ts              // types shared by several files of this folder
  composables/          // useDockTabs.ts, useDockPill.ts, useDockMorph.ts …
  utils/                // component-local pure helpers
  {fragments}/          // child components used ONLY by this component
    MilestoneList.vue   // a lone fragment stays a flat .vue
    SomeFragment/       // a fragment that grew a companion takes the same shape
      index.ts
      SomeFragment.vue
      useSomeFragment.ts
```

Every part shown is optional except the `.vue` file itself. Add `composables/`, `utils/`, `constants.ts`, `types.ts` **only when you actually have them** — don't scaffold empty folders, and don't create the folder at all until the first companion arrives. Whether a symbol belongs in `types.ts`/`constants.ts` at all, or inline in the one file that reads it, is **keeping-symbols-local**.

## The rules

- **`{fragments}/`** (literal braces) holds child components that belong to **this component only**. The moment a child is reused elsewhere, promote it out to `ui/common/<group>/` (shared app widget) or `ui/base/` (generic primitive). A promoted modal, popup or banner goes to `ui/overlays/` instead — `ApproveDeviceModal`, which a store opens, lives there. The braces sort these folders together and signal "private children, not a public part."
- **`index.ts` is the public door — of a folder.** Import via the folder (`@/ui/modules/CalendarDock`), never by reaching into its files. Single component → `export {default} from "./X.vue"`. Several public entries → named (`ui/base/BaseModal/index.ts`: `BaseModal`, `BaseModalProvider`, `useBaseModal`). An overlay opened imperatively exposes its opener (`ui/overlays/SearchModal/index.ts` → `useSearchModal`). A flat lone `.vue` needs no `index.ts` — import the file directly (`@/ui/common/milestones/MilestoneDiamond.vue`).
- **Logic layer is flat.** `composables/`, `utils/`, `constants.ts`, `types.ts` live **directly in the component folder**. A new one-off composable sits flat next to the `.vue` as `useXxx.ts`; it moves into `composables/` once there is more than one. An existing `composables/` that holds a single file stays as it is — don't move it for this rule alone. A shared composable's private helpers (`useTaskDragDrop`, `useDragAutoScroll` under `useTaskColumns`) sit flat beside it in its domain folder (`composables/tasks/`); a composable does not get a folder of its own. There is no `model/` folder — it mixes the three; split its files into those homes.
- **Recursion:** a fragment is a full component — flat `.vue` until it earns a folder, then its own `composables/`, `utils/`, `{fragments}/`, etc. Same rules, one level down.
- **A group folder inside `{fragments}/`.** Several fragments of one kind may sit together in a plain subfolder named after the kind — `ui/modules/RightPanel/{fragments}/Parameters/{fragments}/properties/` holds the six `*Property.vue`, `ui/views/Assistant/{fragments}/cards/` holds the cards. A group is not a component: it has no `index.ts`, the parent imports each file by its path, and a fragment inside it that earns a companion becomes a component folder inside the group.

## Composables take Vue primitives

This is Vue, not React. A composable receives reactive primitives and reaches for stores itself.

- **Inputs are refs** — a template ref from `useTemplateRef`, a `Ref`, a `ComputedRef`. Never a `() => value` getter.
- **A composable that needs store state calls the store itself** — `storeToRefs(useUIStore())` — instead of receiving a flag the caller read from that store.
- **Watch sources are refs** — in composables and in components alike. Store state goes through `storeToRefs`: `watch([activeDay, activeMilestoneId], …)`, not `watch(() => [tasksStore.activeDay, filterStore.activeMilestoneId], …)`. A condition over several refs becomes a `computed` that is watched. A prop is the one getter source Vue needs: `watch(() => props.taskId, …)`.
- **A store's own composables take the store's state as a context object** — `useAiModels({connectionState, …})`, `useTaskMutations({findTaskById, …})`. Inside a setup store the store cannot call itself, so handing its own refs and functions down is the one allowed exception to "call the store yourself".
- **Pass a ref in only when it is local component state** that can't be re-derived without duplicating side effects — `dockTab` from `useDockTabs` goes into `useDockMorph(dockRef, dockTab)`.

```ts
// ❌ React-style: the caller reads the store and hands in getters
useDockCrossFade(dockRef, {expanded: () => uiStore.isCalendarDockExpanded})

// ✅ the composable reads the store itself — ui/modules/CalendarDock/composables/useDockCrossFade.ts
useDockCrossFade(dockRef)
```

## Template: state-dependent classes go through one `get*Classes` function

`:class` holds **one expression**: a call to a `get<Part>Classes(...)` function declared in `<script setup>`. No array, no object syntax, no ternary, no string concatenation inside the template.

```
WRONG — class logic assembled in the template
  <div
    v-for="milestone in openMilestones"
    :key="milestone.id"
    class="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors"
    :class="[
      {'ring-accent border-accent ring-1': isDropTarget(milestone.id)},
      isSelected(milestone.id) ? 'bg-accent/12 text-accent' : 'hover:bg-base-200/60',
    ]"
    @click="onSelect(milestone.id)"
  >
```

The reference is `ui/modules/CalendarDock/CalendarDock.vue`:

```vue
<script setup lang="ts">
function getTabClasses(isActive: boolean) {
  return cn(
    "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
    isActive ? "bg-accent/15 text-accent" : "text-base-content/60 hover:bg-base-200 hover:text-base-content",
  )
}
</script>

<template>
  <button v-for="item in tabs" :key="item.id" :data-tab="item.id" :class="getTabClasses(dockTab === item.id)" @click="selectTab(item.id)">
</template>
```

The wrong example, fixed the same way:

```vue
<script setup lang="ts">
function getMilestoneClasses(id: Milestone["id"], isClosed: boolean) {
  return cn(
    "flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors",
    isClosed && "opacity-50",
    isDropTarget(id) && "ring-accent border-accent ring-1",
    isSelected(id) ? "bg-accent/12 text-accent" : "hover:bg-base-200/60",
  )
}
</script>

<template>
  <div v-for="milestone in openMilestones" :key="milestone.id" :class="getMilestoneClasses(milestone.id, false)" @click="onSelect(milestone.id)">
</template>
```

- **`cn` from `@/utils/ui/tailwindcss`.** The base classes are its first argument — inside the function, not in a separate `class=""` on the element — so `tailwind-merge` resolves a state class against the base class it overrides.
- **Arguments are the minimal state** the classes depend on — a boolean (`isActive`) or an id the function checks itself. Not the event, not the whole store.
- **One function per styled part**, named after it: `getTabClasses`, `getMilestoneClasses`, `getDateClasses`. It is a method — its slot in `<script setup>` is §10 of **structuring-script-setup**.
- **No `ACTIVE_CLASS` / `INACTIVE_CLASS` constants** picked between in the template. The literals live in the function.
- **Named variants of a reusable primitive** (`size`, `variant`, `color`) use `variants.ts` with `defineVariant` instead — `ui/base/BaseButton/variants.ts`.
- **An element with no state-dependent classes** keeps a plain `class=""`. A ready class string a composable computes binds as-is beside it — `class="…" :class="dockWidthClass"` on the dock root.
- **A `defineVariant` result binds as-is** next to the static classes — `class="leading-none" :class="hashClass"` — because merging them in `cn` lets tailwind-merge drop a base class the variant does not replace.
- **A class string from outside with nothing to merge binds as-is** — `:class="triggerClass"`. A `get<Part>Classes` that only returns `cn(props.triggerClass)` adds nothing.
- **A class string that comes from data** (`column.titleClass`, `TASK_EVENT_META[type].chipClass`, `item.classIcon`) is not that exception. It goes through `get<Part>Classes` into `cn` together with the base: `function getIconClasses(titleClass: string) { return cn("size-4", titleClass) }`.

## Template: an interpolation stays whole on one line

`{{ … }}` is read as one thing, so it is never split across lines. When an element's text is an interpolation and the element no longer fits `printWidth` (150), break the **element** into three lines — open tag, content, close tag — and keep the mustache intact.

```
WRONG — the open tag ends mid-interpolation and the expression is stranded on its own line
  <span v-if="framedMilestone" class="text-base-content/55 min-w-0 shrink-0 truncate text-right text-xs font-medium whitespace-nowrap tabular-nums">{{
    framedMilestone.name
  }}</span>

RIGHT — the element breaks, the interpolation doesn't
  <span v-if="framedMilestone" class="text-base-content/55 min-w-0 shrink-0 truncate text-right text-xs font-medium whitespace-nowrap tabular-nums">
    {{ framedMilestone.name }}
  </span>
```

The wrong form is not something anyone types — it is what Prettier produces when you write the whole element on one long line and leave the overflow to the formatter. **Write the break yourself.** Prettier keeps the three-line form as-is; it only folds the mustache open when the source has no line break to preserve.

Short content that already fits stays on one line — `<span class="min-w-0 truncate">{{ framedMilestone.name }}</span>` needs no break.

One caveat, since the two forms are not identical HTML: breaking an **inline** element (`span`, `a`, `p`) puts a space on each side of its text. On a badge or label that is what you want anyway; if a layout truly depends on the element having no leading/trailing space, keep it on one line and shorten it instead — extract the expression into a computed, not into a folded mustache.

## Common mistakes

- Wrapping a lone component in a folder with nothing but the `.vue` and an `index.ts`. A folder is earned by the first companion — until then the component is a flat `.vue` in its category folder.
- Putting a child component beside the parent's `.vue` instead of inside `{fragments}/`.
- Reaching into a component's internals (`@/ui/modules/CalendarDock/{fragments}/MilestoneList.vue`) from outside the folder instead of importing through its `index.ts`.
- Leaving a fragment under `{fragments}/` after it becomes shared — promote it to `ui/common/<group>/` or `ui/base/`.
- Scaffolding empty `composables/`/`utils/` folders "for later." Create them when the file exists.
- Keeping a `model/` folder. Split it into `composables/`, `constants.ts`, `types.ts`.
- Passing `() => store.flag` into a composable. Let the composable call the store.
- Building `:class` from an array, an object, or a ternary in the template. Move it into `get<Part>Classes(...)` returning `cn(...)`.
- Leaving Prettier's folded mustache (`>{{` … `}}</span>`) in a template. Break the element yourself and keep `{{ … }}` on one line.
