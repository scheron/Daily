# Rows Single-Grid Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rows mode's three status shelves with a single responsive grid of one status at a time, a three-segment status switcher, and drag-activated drop zones for the two other statuses — per `docs/superpowers/specs/2026-06-12-rows-active-grid-design.md`.

**Architecture:** `RowsMode.vue` is rewritten and moves into a `modes/rows/` folder with two new presentational children (`StatusSwitcher.vue`, `StatusDropZones.vue`) and a pure helper (`viewStatuses.ts`). All drag/filter/commit machinery stays in the shared `useBoardModel` (one additive export: `tasksByStatus` for unfiltered counts). The drop zones are tiny invisible vue-draggable lists in the existing `daily-board` group bound to the other statuses' local lists, so a drop rides the existing `onColumnChange` → `moveTaskByOrder` flow unchanged.

**Tech Stack:** Vue 3 `<script setup>`, vuedraggable (Sortable), Pinia, TailwindCSS 4, vitest (`pnpm evitest`).

**Conventions for every task:** `type` over `interface`; exported symbols before private helpers; no Co-Authored-By lines in commits; `{fragments}` directory names contain literal braces — quote paths in shell. ⚠️ GIT SAFETY: never `git checkout <sha>` / `git switch --detach`; inspect history only via `git show` / `git diff`.

---

## File map

| File                                                   | Action | Responsibility                                                 |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------- |
| `…/Content/{fragments}/modes/rows/viewStatuses.ts`     | Create | Pure: view order, `otherStatuses`, draggable change-event type |
| `tests/renderer/utils/viewStatuses.test.ts`            | Create | Unit test for the helper                                       |
| `…/Content/model/useBoardModel.ts`                     | Modify | Add `tasksByStatus` to the return (unfiltered counts)          |
| `…/Content/{fragments}/modes/rows/StatusSwitcher.vue`  | Create | Segmented Active/Done/Discarded control with counts            |
| `…/Content/{fragments}/modes/rows/StatusDropZones.vue` | Create | Slide-up two-zone drop panel (drag-only)                       |
| `…/Content/{fragments}/modes/rows/RowsMode.vue`        | Create | Header + grid + zones wiring (replaces the old shelf version)  |
| `…/Content/{fragments}/modes/RowsMode.vue`             | Delete | Old three-shelf implementation                                 |
| `…/Content/Content.vue`                                | Modify | Import path → `modes/rows/RowsMode.vue`                        |

(`…` = `src/renderer/src/ui/views/Main/{fragments}`.) Reference files: `…/Content/model/constants.ts` (`BOARD_COLUMNS`, `DRAGGABLE_ATTRS`), `…/Content/model/useBoardModel.ts` (drag flow), the old `modes/RowsMode.vue` (markup being replaced — read it via the working tree BEFORE deleting).

Key invariants to preserve:

- The grid container (or an ancestor of the draggable list) must carry `data-column-status="<currentView>"` — `useBoardModel.onDragStart` resolves the dragged task through `closest("[data-column-status]")` to feed the global day-drop tracking.
- The zones and the grid share the vue-draggable group `daily-board` from `DRAGGABLE_ATTRS`.
- List and columns modes are untouched; `useBoardModel`'s existing exports keep working for `BoardMode.vue`.

---

### Task 1: `viewStatuses.ts` helper

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/viewStatuses.ts`
- Test: `tests/renderer/utils/viewStatuses.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/utils/viewStatuses.test.ts
import {describe, expect, it} from "vitest"

import {otherStatuses, VIEW_ORDER} from "@renderer/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/viewStatuses"

describe("viewStatuses", () => {
  it("orders views as active, done, discarded", () => {
    expect(VIEW_ORDER).toEqual(["active", "done", "discarded"])
  })

  it("returns the two other statuses in stable order", () => {
    expect(otherStatuses("active")).toEqual(["done", "discarded"])
    expect(otherStatuses("done")).toEqual(["active", "discarded"])
    expect(otherStatuses("discarded")).toEqual(["active", "done"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm evitest run tests/renderer/utils/viewStatuses.test.ts`
Expected: FAIL — cannot resolve `.../rows/viewStatuses`

- [ ] **Step 3: Implement**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/viewStatuses.ts
import type {TaskStatus} from "@shared/types/storage"

/** Display order of the view switcher segments */
export const VIEW_ORDER: TaskStatus[] = ["active", "done", "discarded"]

/** Shape of vuedraggable's @change payload used by the board flow */
export type DraggableChangeEvent = {
  added?: {newIndex: number}
  moved?: {newIndex: number; oldIndex: number}
}

/** The two statuses a dragged task can move to from the given view */
export function otherStatuses(status: TaskStatus): [TaskStatus, TaskStatus] {
  return VIEW_ORDER.filter((other) => other !== status) as [TaskStatus, TaskStatus]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm evitest run tests/renderer/utils/viewStatuses.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/viewStatuses.ts" tests/renderer/utils/viewStatuses.test.ts
git commit -m "feat: add rows view-status helper"
```

---

### Task 2: Single-grid rows mode

**Files:**

- Modify: `src/renderer/src/ui/views/Main/{fragments}/Content/model/useBoardModel.ts` (return block)
- Create: `src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/StatusSwitcher.vue`
- Create: `src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/StatusDropZones.vue`
- Create: `src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/RowsMode.vue`
- Delete: `src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/RowsMode.vue`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Content/Content.vue` (import path)

- [ ] **Step 1: Expose `tasksByStatus` from `useBoardModel.ts`**

In the `return {...}` block, add `tasksByStatus,` right after `localTasksByStatus,`. No other changes.

- [ ] **Step 3: Create `StatusSwitcher.vue`**

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/StatusSwitcher.vue -->
<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import {BOARD_COLUMNS} from "../../../model/constants"
import {VIEW_ORDER} from "./viewStatuses"

import type {TaskStatus} from "@shared/types/storage"

const props = defineProps<{modelValue: TaskStatus; counts: Record<TaskStatus, number>}>()

const emit = defineEmits<{"update:modelValue": [status: TaskStatus]}>()

const columns = VIEW_ORDER.map((status) => BOARD_COLUMNS.find((column) => column.status === status)!)
</script>

<template>
  <div class="bg-base-200 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5">
    <button
      v-for="column in columns"
      :key="column.status"
      type="button"
      class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors"
      :class="props.modelValue === column.status ? `bg-base-100 shadow-xs ${column.titleClass}` : 'text-base-content/60 hover:text-base-content'"
      @click="emit('update:modelValue', column.status)"
    >
      <BaseIcon :name="column.icon" class="size-4" />
      <span>{{ column.label }}</span>
      <span class="rounded-full px-1.5 py-0.5 text-xs font-medium" :class="column.counterClass">{{ props.counts[column.status] }}</span>
    </button>
  </div>
</template>
```

- [ ] **Step 4: Create `StatusDropZones.vue`**

Each zone is a vue-draggable list in the `daily-board` group bound to the REAL `localTasksByStatus[zone.status]` array — a drop fires the same `@change` `added` event a shelf drop used to, so the parent forwards it to `onColumnChange`. Items render hidden (`display:none`), so nothing is visible inside a zone; the Sortable ghost placeholder inherits the hidden item markup, and the `has-[.draggable-task-ghost]` variant drives the hover highlight.

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/StatusDropZones.vue -->
<script setup lang="ts">
import {computed} from "vue"
import VueDraggable from "vuedraggable"

import BaseIcon from "@/ui/base/BaseIcon"

import {BOARD_COLUMNS, DRAGGABLE_ATTRS} from "../../../model/constants"
import {otherStatuses} from "./viewStatuses"

import type {Task, TaskStatus} from "@shared/types/storage"
import type {DraggableChangeEvent} from "./viewStatuses"

const props = defineProps<{
  visible: boolean
  currentView: TaskStatus
  lists: Record<TaskStatus, Task[]>
}>()

const emit = defineEmits<{change: [status: TaskStatus, event: DraggableChangeEvent]}>()

const ZONE_HIGHLIGHT: Record<TaskStatus, string> = {
  active: "has-[.draggable-task-ghost]:border-error has-[.draggable-task-ghost]:bg-error/10",
  done: "has-[.draggable-task-ghost]:border-success has-[.draggable-task-ghost]:bg-success/10",
  discarded: "has-[.draggable-task-ghost]:border-warning has-[.draggable-task-ghost]:bg-warning/10",
}

const zones = computed(() => otherStatuses(props.currentView).map((status) => BOARD_COLUMNS.find((column) => column.status === status)!))
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-150"
    enter-from-class="translate-y-full"
    leave-active-class="transition-transform duration-150"
    leave-to-class="translate-y-full"
  >
    <div v-show="props.visible" class="flex gap-1.5">
      <VueDraggable
        v-for="zone in zones"
        :key="zone.status"
        :list="props.lists[zone.status]"
        item-key="id"
        :sort="false"
        v-bind="DRAGGABLE_ATTRS"
        class="bg-base-100/95 border-base-300 flex h-20 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed backdrop-blur-sm transition-colors"
        :class="[zone.titleClass, ZONE_HIGHLIGHT[zone.status]]"
        @change="emit('change', zone.status, $event)"
      >
        <template #header>
          <BaseIcon :name="zone.icon" class="pointer-events-none size-5" />
          <span class="pointer-events-none text-sm font-semibold">{{ zone.label }}</span>
        </template>
        <template #item>
          <div class="hidden" />
        </template>
      </VueDraggable>
    </div>
  </Transition>
</template>
```

- [ ] **Step 5: Create the new `RowsMode.vue`**

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/RowsMode.vue -->
<script setup lang="ts">
import {computed, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {useTasksStore} from "@/stores/tasks.store"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TaskCard from "@/ui/modules/TaskCard"

import {BOARD_COLUMNS, DRAGGABLE_ATTRS} from "../../../model/constants"
import {useBoardModel} from "../../../model/useBoardModel"
import StatusDropZones from "./StatusDropZones.vue"
import StatusSwitcher from "./StatusSwitcher.vue"

import type {Task, TaskStatus} from "@shared/types/storage"
import type {DraggableChangeEvent} from "./viewStatuses"

const props = defineProps<{tasks: Task[]; dndDisabled: boolean}>()

const tasksStore = useTasksStore()

const currentView = ref<TaskStatus>("active")

const {
  isDragging,
  isDragDisabled,
  localTasksByStatus,
  tasksByStatus,
  tagsByStatus,
  onDragStart,
  onDragEnd,
  onDragOver,
  onColumnChange,
  onSelectTag,
  getSelectedTagIdsSet,
  getTaskTags,
} = useBoardModel({tasks: () => props.tasks, dndDisabled: () => props.dndDisabled})

const counts = computed<Record<TaskStatus, number>>(() => ({
  active: tasksByStatus.value.active.length,
  done: tasksByStatus.value.done.length,
  discarded: tasksByStatus.value.discarded.length,
}))

const currentColumn = computed(() => BOARD_COLUMNS.find((column) => column.status === currentView.value)!)

function onZoneChange(status: TaskStatus, event: DraggableChangeEvent) {
  void onColumnChange(status, event)
}

watch(
  () => tasksStore.activeDay,
  () => (currentView.value = "active"),
)
</script>

<template>
  <div class="relative h-full w-full" @dragover="onDragOver">
    <div class="h-full w-full overflow-x-hidden overflow-y-auto p-1.5">
      <div class="bg-base-100 border-base-300 flex min-h-full w-full flex-col rounded-xl border">
        <div class="border-base-300 flex items-center gap-3 border-b px-3 py-1.5">
          <StatusSwitcher v-model="currentView" :counts="counts" />

          <div class="min-w-0 flex-1">
            <DynamicTagsPanel
              :tags="tagsByStatus[currentView]"
              :selected-tags="getSelectedTagIdsSet(currentView)"
              selectable
              @select="onSelectTag(currentView, $event)"
            />
          </div>
        </div>

        <div class="relative flex-1 p-1.5" :data-column-status="currentView">
          <VueDraggable
            :key="currentView"
            :list="localTasksByStatus[currentView]"
            item-key="id"
            :disabled="isDragDisabled"
            class="grid gap-1.5"
            style="grid-template-columns: repeat(auto-fill, 294px)"
            v-bind="DRAGGABLE_ATTRS"
            @start="onDragStart"
            @end="onDragEnd"
            @change="onColumnChange(currentView, $event)"
          >
            <template #item="{element: task}">
              <div class="relative h-[134px] w-[294px]">
                <TaskCard :task="task" :tags="getTaskTags(task)" view="rows" />
              </div>
            </template>
          </VueDraggable>

          <div
            v-if="!localTasksByStatus[currentView].length && !isDragging"
            class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
          >
            <div class="bg-base-200 rounded-full p-3">
              <BaseIcon name="empty" class="size-5" />
            </div>
            <span class="text-sm">No {{ currentColumn.emptyLabel }} tasks</span>
          </div>
        </div>
      </div>
    </div>

    <StatusDropZones
      class="absolute inset-x-3 bottom-3 z-10"
      :visible="isDragging"
      :current-view="currentView"
      :lists="localTasksByStatus"
      @change="onZoneChange"
    />
  </div>
</template>
```

Notes:

- `data-column-status="currentView"` sits on the grid's wrapper — `useBoardModel.onDragStart` needs it to resolve the dragged task (day-drop tracking).
- `:key="currentView"` re-creates the Sortable instance per view (clean state when switching).
- The collapse-related `useBoardModel` exports (`visibleColumns`, `isColumnCollapsed`, `onToggleColumn`, `onColumnDragEnter`) are intentionally NOT consumed — they remain for `BoardMode.vue`.
- `uiStore` is no longer needed here — the new component must not import it.

- [ ] **Step 6: Delete the old file and update the import**

```bash
git rm "src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/RowsMode.vue"
```

In `src/renderer/src/ui/views/Main/{fragments}/Content/Content.vue` change:

```ts
import RowsMode from "./{fragments}/modes/RowsMode.vue"
```

to:

```ts
import RowsMode from "./{fragments}/modes/rows/RowsMode.vue"
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck:render && pnpm lint && pnpm evitest run --project renderer`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rows mode as single status grid with switcher and drop zones"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the full gate**

Run: `pnpm check:all`
Expected: lint, three typechecks, circular-deps, full suite PASS.

- [ ] **Step 2: Manual sweep** (`pnpm dev`, switch to rows mode via the toggle-view shortcut if needed)

1. Single section with the segmented switcher; counts match; Active is the default.
2. Grid: tiles 294×134 wrap by window width; sidebar collapse reflows the column count.
3. Switching views swaps the tile set; tag filter applies per view and selections are independent.
4. Drag a tile: the two-zone panel slides up with the two OTHER statuses; hovering a zone highlights it; dropping moves the task (it disappears from the current view, counts update).
5. Reorder within the grid persists after releasing.
6. Mid-drag, dropping on a footer/sidebar day still reschedules (zones don't break day-drop).
7. Day change resets the view to Active and clears nothing else unexpectedly.
8. List and columns modes behave exactly as before.

- [ ] **Step 3: Commit any fixes as `fix:` commits; done when the gate and sweep pass.**
