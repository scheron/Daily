---
name: structuring-components
description: Use when creating, moving, renaming or splitting a Vue component under the renderer's `ui/` — which category or `(group)` it goes in, whether it gets a folder, what its `index.ts` exports, where its composable, util, constant, type, modal or child component lives, what `{fragments}/` means, and what stays in the component versus a composable. Also whenever you write a `:class` binding that depends on state, a composable a component calls, or a template element whose text is a `{{ }}` interpolation.
---

# Structuring Components

Paths below are relative to the renderer root `apps/desktop/src/renderer/src` — the `@/` alias. Case, suffixes and word order in names: **naming-files**. Order of sections inside `<script setup>`: **structuring-script-setup**. How a composable takes its inputs and where its responsibility ends: **writing-composables**. Whether a symbol stays inline or earns a file: **keeping-symbols-local**. Helpers in `utils/`: **structuring-utility-files**. Comments: **writing-comments**.

## Component folders are fractal

Every component folder has the same shape, and a private child (a fragment) is a smaller component of that same shape, one level down. There is no special top-level layout: the pattern recurses all the way down.

## Kinds of folders

| Kind             | Form                                | Example                             |
| ---------------- | ----------------------------------- | ----------------------------------- |
| category         | closed list, see Categories         | `base/`, `views/`                   |
| group            | `(kebab-name)`                      | `common/(pickers)/`                 |
| component folder | PascalCase                          | `modules/CalendarDock/`             |
| private children | `{fragments}` with literal braces   | `modules/CalendarDock/{fragments}/` |
| component logic  | lowercase: `composables/`, `utils/` | `modules/CalendarDock/composables/` |

The form tells what a folder is: PascalCase is a component, lowercase is logic, parentheses are a group, braces are private children.

## Categories under `ui/`

| Folder             | Holds                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `base/`            | generic primitives with no app knowledge — `BaseButton`, `BaseModal`, `BasePopup`                         |
| `common/(<kind>)/` | app widgets used in several places, always inside a kind group — `(comboboxes)/`, `(pickers)/`, `(misc)/` |
| `modules/`         | the big blocks of the main screen — `TaskBoard`, `CalendarDock`, `RightPanel`, `ActionsDock`              |
| `overlays/`        | modals, popups and banners over the app — `SearchModal`, `ConfirmPopup`, `UpdateBanner`                   |
| `views/`           | whole screens, one per route — `Main`, `Settings`, `Assistant`                                            |

### `base/`

- A Base folder's `index.ts` exports **one** component, `Base<Name>`, and that component's types. Its private parts live in its `{fragments}/` without the prefix: `base/BaseContextMenu/{fragments}/MenuPanel/`.
- Callers configure a Base component only through props and slots, and style its inner parts through class props: `class` for the root, `triggerClass`, `contentClass`, `containerClass` for the parts (`BasePopup`).
- A Base component never imports a sibling Base component, not even through its composable or its door. A composition of primitives is an app widget: a field built from `BaseInput` and `BaseIcon` lives in `common/(inputs)/SearchInput/`. Private parts inside one Base folder are fine. Base stays a leaf layer, so nothing cycles and each primitive is replaced on its own.
- A primitive lives in `base/` for what it is — a checkbox, a resize handle — even with one consumer. The one-consumer rule of keeping-symbols-local moves app widgets and fragments, not primitives.
- A Base folder may hold `variants.ts`, the component's class map built with `defineVariant`. A component never imports another component's variants, nor the types derived from them: a caller passes `BaseButton` its `variant` prop typed with a union of its own, and when two components need the same class map, each keeps its own copy.
- An application host or provider gets no Base wrapper.

### `common/`

`common/` holds only groups, and groups only by kind. A kind group appears as soon as the kind can be named clearly, even for one component — `(comboboxes)`, `(pickers)`; a widget whose kind cannot be named goes to `(misc)`. The catalog keeps growing, and finding anything in it needs subgroups from the start. Never invent a domain catch-all to dodge naming the kind; domain groups belong to `views/`.

### Groups

A group is a sorting folder, not a component: it has no `index.ts`, holds no loose composable, util or type, and the code that uses a member imports it by its own path. A group is written `(kebab-name)`, and parentheses mean a group only under `ui/`.

- **By kind** — `(comboboxes)`, `(pickers)`, `(icons)`, `(panels)`, `(inputs)`, `(menus)`, `(modals)` — every member carries the kind as a suffix, in the singular, strictly: `common/(comboboxes)/StatusCombobox.vue`, `common/(pickers)/BranchPicker.vue`. `MilestoneDiamond` in `(icons)` is wrong, `MilestoneIcon` is right.
- **By domain** — `(settings)`, `(sync)` — no suffix. Domain groups sort `views/`, never `common/`.

## A folder is earned

A lone component is a flat `.vue` in its category or group folder: `ui/common/(pickers)/BranchPicker.vue`. No folder, no `index.ts`; callers import the file itself, `@/ui/common/(pickers)/BranchPicker.vue`.

It graduates into a folder with its first **companion**:

- `composables/`
- a `utils/` or a pure helper file
- `constants.ts`, `types.ts`, `variants.ts`
- `state.ts`: state every instance of the component shares (structuring-script-setup)
- `{fragments}/`
- a second public `.vue` outside `base/` (a component and its provider)

A colocated test is **not** a companion: `BranchPicker.vue` and `BranchPicker.test.ts` stay flat side by side.

`index.ts` exists to be the door of a folder: no companion, no folder, no door. When a flat component grows its first companion, promote it into a folder then.

```
WRONG — a folder that holds nothing but the component
  UpdateBanner/
    UpdateBanner.vue
    index.ts        // re-exports the one file beside it

RIGHT
  overlays/UpdateBanner.vue
```

## Anatomy of a component folder

```
CalendarDock/
  index.ts              // export {default} from "./CalendarDock.vue"
  CalendarDock.vue
  constants.ts          // constants shared by several files of this folder
  types.ts              // types shared by several files of this folder
  composables/          // useDockTabs.ts, useDockCrossFade.ts …; a lone composable lives here too
  utils/                // component-local pure helpers
  {fragments}/          // child components used ONLY by this component
    MilestoneList.vue   // a lone fragment stays a flat .vue
    SomeFragment/       // a fragment that grew a companion takes the same shape
      index.ts
      SomeFragment.vue
      composables/
```

Every part but the `.vue` is optional: create it when its first file exists, never as an empty folder "for later".

- **The logic layer is flat.** `composables/`, `utils/`, `constants.ts`, `types.ts` live directly in the component folder.
- A composable always lives in `composables/`, even when it is the only one: `ui/modules/CalendarDock/composables/useDockCrossFade.ts`, never `CalendarDock/useDockCrossFade.ts`. The second composable then joins it without a move.
- A shared composable's private helpers (`useTaskDragDrop`, `useDragAutoScroll` under `useTaskColumns`) sit flat beside it in its domain folder (`composables/tasks/`); a composable does not get a folder of its own.
- `utils/` holds one function per file by default: **structuring-utility-files**.
- Whether a symbol belongs in `types.ts` or `constants.ts` at all, or inline in the one file that reads it, is keeping-symbols-local's call.
- **Forbidden** in a component folder: `ui/`, `model/`, `fragments/` without braces, `helpers`, `index.vue`, a script holding only `name`, a loose composable file beside the `.vue`. A `model/` folder mixes composables, helpers and constants: split its files into `composables/`, `utils/`, `constants.ts` and `types.ts`.

## `{fragments}/`

- Holds the child components that belong to this component only. The braces sort these folders together and mark them private.
- A fragment is a full component: a flat `.vue` until it earns a folder, then the same rules one level down.
- A fragment that is reused elsewhere moves out: to its kind group in `ui/common/` (shared app widget), to `ui/base/` if it is a primitive, or to `ui/overlays/` if it is a modal, popup or banner.
- Import a component through its folder's door, never by reaching into its `{fragments}/`.

### A group inside `{fragments}/`

Rare: by kind only, with the kind suffix, and only for three or more fragments of that kind. From three the group is required; below three it is forbidden, because the fragments are neighbouring parts of one component and a group of two only adds a level. A piece related by meaning is a fragment folder, not a group.

A group is not a component: it has no `index.ts`, the parent imports each member by its path, and a member that earns a companion becomes a component folder inside the group: `{fragments}/(cards)/OnboardingAICard.vue`, `{fragments}/(cards)/ToolConfirmationCard/`.

A group of modals keeps the modal shape: `{fragments}/(modals)/<Name>Modal/`, with its opener composable and a door that exports it.

## `index.ts`

- Import a component folder through its door (`@/ui/modules/CalendarDock`), never by reaching into its files. A flat lone `.vue` needs no `index.ts`: import the file directly.
- One component: `export {default} from "./CalendarDock.vue"`.
- Several public entries outside `base/`: named exports.
- A Base folder: its one component and that component's types.
- A modal: **only its opener**, as a named export; callers open the modal and never mount it — `ui/overlays/SearchModal/index.ts`: `export {useSearchModal} from "./composables/useSearchModal"`.
- A door never exposes the folder's internals; a type goes through it only once something outside the folder imports it (keeping-symbols-local).
- No barrel over a group or a category folder.

## Modals

A modal is always a folder: `SearchModal.vue`, its opener `composables/useSearchModal.ts`, and an `index.ts` that exports the opener by name. The opener takes the modal's handle from `useBaseModal` with the modal's id, opens it with `show(SearchModal, {…props, onClose: hide})` and closes it with `hide`.

A modal that answers a question emits its outcome — `save`, `discard`, `cancel` — and its opener passes the matching `on…` handlers to `show`, calls `hide` and resolves the `Promise<boolean>` it returned:

```ts
const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

const proceed = await confirmLeaveIfDirty()
if (proceed) taskEditorStore.open(props.task.id)
```

A modal with one owner lives in the owner's `{fragments}/<Name>Modal/`, named and opened by the same rules. It moves to `ui/overlays/` once it is reused, or once something outside the UI tree, such as a store, opens it. It opens through its own opener wherever it lies, so the move changes only the import path.

## The component is the View

A component is the View: it shows. Logic lives in composables, in the component's own `composables/` unless keeping-symbols-local moves it higher.

- **The View keeps** its template, its named template refs and its short visual behaviour — disclosure, focus, caret placement, element geometry, styling, display formatting — together with the watchers and lifecycle hooks that serve them. A short view-only interaction does not earn a composable merely because it uses a ref or a watch.
- **A workflow composable owns** loading and saving, validation, dirty and pending state, cancellation, retry and application commands, even with one caller.
- **UI logic that has grown, or has a clear responsibility of its own** — a resize handle, a gesture, a virtual list, an animation protocol — moves to a composable in the same `composables/`. It takes the View's refs explicitly and returns what the View binds.

Ownership is never inferred from a `ref`, a `watch`, a timer, an API name, a flag prefix or the length of the script. The View composes meaningful pieces directly; it never hides its whole script in one aggregate composable. The decision guide is in writing-composables. Logic is tested through its composable; how the component itself is checked is writing-tests'.

The reference is the dock's cross-fade. Its animation protocol has a clear responsibility, so it leaves the View: `ui/modules/CalendarDock/composables/useDockCrossFade.ts` owns the animations and reads the store itself, while `CalendarDock.vue` keeps the template ref, passes it in and binds what comes back:

```ts
const dockRef = useTemplateRef("dock")

const {onEnter, onLeave} = useDockCrossFade(dockRef)
```

## Classes come from the script

A static class string stays in the template: `class="w-full rounded-md"`. Lifting it into a constant is wrong, even when two elements repeat it. A class that is **built** — over props, a condition, a variant lookup — leaves the template:

- For state the script has, a `computed` named `<part>Class`, built with `cn`.
- For a value only the template has, such as a loop item, a method `get<Part>Classes(item)` that takes the value and returns the class. That is the only case for a function.
- The template only binds: `:class="statusIconClass"`, `:class="getMilestoneClasses(milestone.id)"`. No array, no object syntax, no ternary, no string concatenation, no `cn(…)` inside the template.

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

Only the template has the loop item, so the fix is a method:

```vue
<script setup lang="ts">
function getMilestoneClasses(id: Milestone["id"]) {
  return cn("flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors", {"ring-accent border-accent ring-1": isDropTarget(id)}, [
    isSelected(id) ? "bg-accent/12 text-accent" : "hover:bg-base-200/60",
  ])
}
</script>

<template>
  <div v-for="milestone in openMilestones" :key="milestone.id" :class="getMilestoneClasses(milestone.id)" @click="onSelect(milestone.id)">
</template>
```

`UpdateBanner`'s status icon depends only on state the script has, so it is a `computed`:

```vue
<script setup lang="ts">
const statusIconClass = computed(() => cn("size-4", {"animate-spin": updateStore.isBusy, "text-warning": hasInstallFailure.value}))
</script>

<template>
  <BaseIcon :name="statusIcon" :class="statusIconClass" />
</template>
```

For both forms:

- **One `computed` or method per styled part**, named after the part: `statusIconClass`, `getMilestoneClasses`, `getDateClasses`. The `computed` sits in §8 (computeds) of **structuring-script-setup**, the method in §10 (methods).
- **A method's arguments are the minimal state** the classes depend on — a boolean, or an id the method checks itself. Never the event, never the whole store.
- **No `ACTIVE_CLASS` / `INACTIVE_CLASS` constants** picked between in the template. The literals live in the `computed` or the method.
- **An element with no built classes** keeps a plain `class=""`. A ready class string a composable computes binds as-is beside it — `class="…" :class="dockWidthClass"` on the dock root.
- **A class prop from outside with nothing to merge binds as-is** — `:class="triggerClass"`. A `computed` that only returns `cn(props.triggerClass)` adds nothing.

### `cn`

`cn` from `@/utils/ui/tailwindcss` is the project's `clsx` + `tailwind-merge` helper.

- `cn` is called in the script, never in the template.
- On an element with built classes, the base classes are `cn`'s first argument — inside the `computed` or method, not in a separate `class=""` on that element — so `tailwind-merge` resolves a state class against the base class it overrides.
- Inside `cn`, a condition is never `cond && "class"`. A class that is on or off is an object, the class as the key and the condition as the value; a choice between two classes is an array holding one ternary, never two object keys with the condition flipped:

```ts
const statusIconClass = computed(() => cn("size-4", {"animate-spin": updateStore.isBusy}))
const triggerClass = computed(() => cn("gap-2 px-2.5", [props.isFull ? "w-full justify-start" : "h-8"]))
```

- **A class string that comes from data** (`column.titleClass`, `TASK_EVENT_META[type].chipClass`, `item.classIcon`) goes through `cn` together with the base: `function getIconClasses(titleClass: string) { return cn("size-4", titleClass) }` for a loop item, a `computed` otherwise.
- **A `defineVariant` result binds as-is** next to the static classes — `class="leading-none" :class="hashClass"` — and is not merged in `cn`, where `tailwind-merge` would drop a base class the variant does not replace.

### Variants of a primitive

A variant-carrying primitive's look — a button's colour and size — is its `variant` and `size` props, declared in its `variants.ts` with `defineVariant` (`ui/base/BaseButton/variants.ts`). A `BaseButton` instance carries placement classes only; its look never goes in `:class`. When state picks the look, a `computed` `<part>Variant` returns the variant name, or `get<Part>Variant(...)` for a loop item — `getTabVariant(dockTab === item.id)` over the tabs in `ui/modules/CalendarDock/CalendarDock.vue`. A variant that follows a status comes from data, stored beside the status's other metadata, like `TASK_COLUMNS[].buttonVariant`. One exception: the day cell in `TaskCalendar`, whose four overlapping states stay in `getDateClasses`.

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

The wrong form is not something anyone types: it is what Prettier produces when the whole element is written on one long line and the overflow is left to the formatter. **Write the break yourself.** Prettier keeps the three-line form as it is; it folds the mustache open only when the source has no line break to preserve.

Short content that already fits stays on one line: `<span class="min-w-0 truncate">{{ framedMilestone.name }}</span>` needs no break.

The two forms are not identical HTML: breaking an **inline** element (`span`, `a`, `p`) puts a space on each side of its text. On a badge or a label that is what you want anyway. When a layout depends on the element having no leading or trailing space, keep it on one line and shorten it instead — extract the expression into a `computed`, not into a folded mustache.

## Common mistakes

- A folder around a lone component, or a folder only because the component has a test.
- An `index.ts` that only re-exports the `.vue` beside it: the same mistake wearing a barrel. Delete the folder, keep the flat `.vue`.
- A composable beside the `.vue` instead of in the folder's `composables/`, because it is the only one.
- A child component beside the parent's `.vue` instead of in `{fragments}/`.
- Reaching into a component's internals (`@/ui/modules/CalendarDock/{fragments}/MilestoneList.vue`) from outside the folder instead of importing through its `index.ts`; leaving a fragment under `{fragments}/` after it becomes shared.
- Three or more fragments of one kind left flat in `{fragments}/`, or a group there with fewer than three.
- A new group without parentheses; a `base/` component without `Base`, a group member without the group's suffix.
- A domain group in `common/`; a widget left in `(misc)` when its kind can be named.
- A Base component importing a sibling Base component.
- A Base folder whose door exports more than its one component and that component's types.
- A modal as a flat `.vue`, or a modal door that exports the component instead of its opener.
- A barrel over a group or a category folder; a composable, util or type lying loose in a group folder.
- Importing a variant type such as `ButtonColorVariant` from another component instead of keeping a union of its own.
- Scaffolding empty `composables/` or `utils/` folders "for later"; keeping a `model/` folder.
- A whole `<script setup>` moved into one `useXxx` that forwards every binding back to the template.
- Passing `() => store.flag` into a composable instead of letting it call the store (writing-composables).
- A class built in the template; `cn(…)` called in the template; a static class string lifted into a constant.
- A method for a class that depends only on script state, instead of a `computed`.
- `cond && "class"` inside `cn(…)` instead of `{"class": cond}`; a bare ternary, or two flipped object keys, instead of `[cond ? "a" : "b"]`.
- A button's colour or size set through `:class` instead of its `variant` and `size`.
- Prettier's folded mustache (`>{{` … `}}</span>`) left in a template. Break the element yourself and keep `{{ … }}` on one line.
