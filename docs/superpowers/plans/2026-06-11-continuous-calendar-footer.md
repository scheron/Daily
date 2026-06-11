# Continuous Calendar Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed footer week strip with a collapsible continuous calendar — an infinite, horizontally-scrollable lattice of 5-week chunks where months are shown via labels and dimming, per `docs/superpowers/specs/2026-06-11-continuous-calendar-footer-design.md`.

**Architecture:** Pure chunk math lives in a new `lattice.ts` (epoch-anchored 5-week chunks, viewport math). `Footer.vue` becomes a folder-based container that switches between the extracted `WeekStrip.vue` (collapsed, 40px) and a new `ContinuousCalendar.vue` (expanded, 260px). Scroll behavior (focus-month detection, edge extension with scrollLeft compensation, scroll-to-date) is a thin composable `useCalendarScroll.ts`. Data comes entirely from the existing `tasksStore` range cache; the store only needs to expose `loadedRange` and `extendRange`. The expanded/collapsed flag persists via the existing `useSettingValue` pattern in `ui.store.ts` backed by a new `Settings.layout.calendarExpanded` field.

**Tech Stack:** Vue 3 + `<script setup>`, Pinia, Luxon, TailwindCSS 4, vitest (`pnpm evitest`), @vue/test-utils + happy-dom for renderer tests.

**Conventions that apply to every task:** `type` over `interface`; exported symbols before private helpers in each file; no Co-Authored-By lines in commits; commit messages follow the repo's `feat:`/`refactor:`/`test:` style.

---

## File map

| File                                                                       | Action      | Responsibility                                             |
| -------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts`             | Create      | Pure chunk/viewport math + dot status                      |
| `tests/renderer/utils/calendarLattice.test.ts`                             | Create      | Unit tests for lattice math                                |
| `src/shared/types/storage.ts`                                              | Modify      | `layout.calendarExpanded: boolean`                         |
| `src/main/storage/models/_rowMappers.ts`                                   | Modify      | Default `calendarExpanded: true`                           |
| `src/renderer/src/stores/ui.store.ts`                                      | Modify      | `calendarExpanded` setting + toggle                        |
| `tests/renderer/stores/ui.store.test.ts`                                   | Modify      | Toggle behavior test                                       |
| `src/renderer/src/stores/tasks.store.ts`                                   | Modify      | Expose `loadedRange`, `extendRange`                        |
| `tests/renderer/stores/tasks.store.test.ts`                                | Modify      | Tests for the exposed API                                  |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue`             | Move+Modify | Container: state switch, chevrons, drag&drop pointer logic |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/WeekStrip.vue`          | Create      | Extracted current week strip (unchanged visuals)           |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue` | Create      | Expanded lattice rendering                                 |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/useCalendarScroll.ts`   | Create      | Scroll glue: focus month, edges, scroll-to-date            |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/index.ts`               | Create      | `export {default} from "./Footer.vue"`                     |
| `tests/renderer/components/ContinuousCalendar.test.ts`                     | Create      | Component behavior tests                                   |
| `src/renderer/src/ui/views/Main/Main.vue`                                  | Modify      | Import path for Footer folder                              |
| `src/renderer/src/ui/views/Main/model/useContentSize.ts`                   | Modify      | Reactive footer height (40 / 260)                          |

Note: the `{fragments}` directory name contains literal braces — quote paths in shell commands.

---

### Task 1: Lattice math (`lattice.ts`)

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts`
- Test: `tests/renderer/utils/calendarLattice.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/renderer/utils/calendarLattice.test.ts
import {describe, expect, it} from "vitest"

import {
  buildChunk,
  buildChunkRange,
  CHUNK_WIDTH,
  chunkIndexForDate,
  dateAtViewportCenter,
  dayOfMonth,
  DAYS_PER_CHUNK,
  getDayDotStatus,
  LATTICE_EPOCH,
  monthKey,
  scrollLeftForDate,
} from "@renderer/ui/views/Main/{fragments}/Footer/lattice"

describe("lattice chunk math", () => {
  it("anchors chunk 0 at the epoch Monday", () => {
    expect(chunkIndexForDate(LATTICE_EPOCH)).toBe(0)
    expect(buildChunk(0).startDate).toBe("2001-01-01")
  })

  it("puts day 35 into the next chunk", () => {
    expect(chunkIndexForDate("2001-02-04")).toBe(0) // day 34, last of chunk 0
    expect(chunkIndexForDate("2001-02-05")).toBe(1) // day 35, first of chunk 1
  })

  it("handles dates before the epoch", () => {
    expect(chunkIndexForDate("2000-12-31")).toBe(-1)
    expect(buildChunk(-1).weeks[4][6]).toBe("2000-12-31")
  })

  it("builds a 5×7 grid of consecutive dates with the label-defining middle day", () => {
    const chunk = buildChunk(0)
    expect(chunk.weeks).toHaveLength(5)
    chunk.weeks.forEach((week) => expect(week).toHaveLength(7))
    expect(chunk.weeks[0][0]).toBe("2001-01-01")
    expect(chunk.weeks[4][6]).toBe("2001-02-04")
    expect(chunk.middleDate).toBe("2001-01-18")
  })

  it("keeps a month boundary inside a single row", () => {
    // June→July 2026: a row must read Mon Jun 29 .. Sun Jul 5
    const chunk = buildChunk(chunkIndexForDate("2026-06-29"))
    const row = chunk.weeks.find((week) => week[0] === "2026-06-29")
    expect(row).toBeDefined()
    expect(row![6]).toBe("2026-07-05")
  })

  it("renders every date exactly once and gaplessly across a chunk range", () => {
    const chunks = buildChunkRange("2025-12-15", "2026-07-15")
    const all = chunks.flatMap((chunk) => chunk.weeks.flat())
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(chunks.length * DAYS_PER_CHUNK)
    expect(all).toContain("2025-12-15")
    expect(all).toContain("2026-07-15")
  })
})

describe("viewport math", () => {
  it("returns the chunk middle date when a chunk fills the viewport", () => {
    const first = chunkIndexForDate("2026-06-11")
    const date = dateAtViewportCenter({scrollLeft: 0, clientWidth: CHUNK_WIDTH, firstChunkIndex: first})
    expect(date).toBe(buildChunk(first).middleDate)
  })

  it("scrollLeftForDate centers the chunk containing the date", () => {
    const first = 100
    const target = buildChunk(103).middleDate
    const scrollLeft = scrollLeftForDate({date: target, firstChunkIndex: first, clientWidth: CHUNK_WIDTH * 3})
    expect(dateAtViewportCenter({scrollLeft, clientWidth: CHUNK_WIDTH * 3, firstChunkIndex: first})).toBe(target)
  })
})

describe("day helpers", () => {
  const task = {id: "t1"} as never

  it("getDayDotStatus returns null without tasks", () => {
    expect(getDayDotStatus(null)).toBeNull()
    expect(getDayDotStatus(undefined)).toBeNull()
    expect(getDayDotStatus({tasks: [], countActive: 0} as never)).toBeNull()
  })

  it("getDayDotStatus returns 'active' when active tasks remain", () => {
    expect(getDayDotStatus({tasks: [task], countActive: 1} as never)).toBe("active")
  })

  it("getDayDotStatus returns 'done' when tasks exist and none are active", () => {
    expect(getDayDotStatus({tasks: [task], countActive: 0} as never)).toBe("done")
  })

  it("dayOfMonth and monthKey slice ISO dates", () => {
    expect(dayOfMonth("2026-06-09")).toBe(9)
    expect(monthKey("2026-06-09")).toBe("2026-06")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm evitest run tests/renderer/utils/calendarLattice.test.ts`
Expected: FAIL — cannot resolve `.../Footer/lattice`

- [ ] **Step 3: Implement `lattice.ts`**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts
import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

export const WEEKS_PER_CHUNK = 5
export const DAYS_PER_CHUNK = WEEKS_PER_CHUNK * 7
/** Day cell box size in px; also drives all viewport math */
export const CELL_SIZE = 36
/** Horizontal padding inside one chunk block, px */
export const CHUNK_PADDING_X = 12
export const CHUNK_WIDTH = CELL_SIZE * 7 + CHUNK_PADDING_X * 2
/** Fixed epoch Monday; chunk boundaries never move relative to it */
export const LATTICE_EPOCH: ISODate = "2001-01-01"

export type LatticeChunk = {
  index: number
  /** Monday opening the chunk */
  startDate: ISODate
  /** 18th of 35 days (middle row, Thursday); defines the chunk's month label */
  middleDate: ISODate
  /** 5 rows (weeks) × 7 columns (Mon..Sun) */
  weeks: ISODate[][]
}

export function chunkIndexForDate(date: ISODate): number {
  return Math.floor(daysFromEpoch(date) / DAYS_PER_CHUNK)
}

export function buildChunk(index: number): LatticeChunk {
  const start = DateTime.fromISO(LATTICE_EPOCH).plus({days: index * DAYS_PER_CHUNK})
  const weeks: ISODate[][] = []

  for (let row = 0; row < WEEKS_PER_CHUNK; row++) {
    const week: ISODate[] = []
    for (let col = 0; col < 7; col++) {
      week.push(start.plus({days: row * 7 + col}).toISODate()!)
    }
    weeks.push(week)
  }

  return {
    index,
    startDate: start.toISODate()!,
    middleDate: start.plus({days: Math.floor(DAYS_PER_CHUNK / 2)}).toISODate()!,
    weeks,
  }
}

export function buildChunkRange(from: ISODate, to: ISODate): LatticeChunk[] {
  const chunks: LatticeChunk[] = []
  for (let i = chunkIndexForDate(from); i <= chunkIndexForDate(to); i++) {
    chunks.push(buildChunk(i))
  }
  return chunks
}

export function getDayDotStatus(day: Day | null | undefined): "active" | "done" | null {
  if (!day || day.tasks.length === 0) return null
  return day.countActive > 0 ? "active" : "done"
}

/** Date shown at the horizontal center of the viewport (middle row of the centered column) */
export function dateAtViewportCenter(params: {scrollLeft: number; clientWidth: number; firstChunkIndex: number}): ISODate {
  const centerX = params.scrollLeft + params.clientWidth / 2
  const chunkOffset = Math.floor(centerX / CHUNK_WIDTH)
  const xInChunk = centerX - chunkOffset * CHUNK_WIDTH - CHUNK_PADDING_X
  const col = Math.min(6, Math.max(0, Math.floor(xInChunk / CELL_SIZE)))
  const middleRow = Math.floor(WEEKS_PER_CHUNK / 2)
  const dayOffset = (params.firstChunkIndex + chunkOffset) * DAYS_PER_CHUNK + middleRow * 7 + col

  return DateTime.fromISO(LATTICE_EPOCH).plus({days: dayOffset}).toISODate()!
}

/** scrollLeft that horizontally centers the chunk containing the date */
export function scrollLeftForDate(params: {date: ISODate; firstChunkIndex: number; clientWidth: number}): number {
  const chunkOffset = chunkIndexForDate(params.date) - params.firstChunkIndex
  return Math.max(0, chunkOffset * CHUNK_WIDTH - (params.clientWidth - CHUNK_WIDTH) / 2)
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}

function daysFromEpoch(date: ISODate): number {
  return Math.round(DateTime.fromISO(date).diff(DateTime.fromISO(LATTICE_EPOCH), "days").days)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/utils/calendarLattice.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts" tests/renderer/utils/calendarLattice.test.ts
git commit -m "feat: add continuous calendar lattice math"
```

---

### Task 2: Settings field `layout.calendarExpanded`

**Files:**

- Modify: `src/shared/types/storage.ts` (layout block, ~line 58)
- Modify: `src/main/storage/models/_rowMappers.ts` (`getDefaultSettings`, ~line 158)

- [ ] **Step 1: Add the type field**

In `src/shared/types/storage.ts`, inside `Settings.layout` after `columnsCollapsed`:

```ts
/**
 * Indicates whether the footer calendar is expanded (continuous month lattice)
 * or collapsed to the single-week strip.
 * @default true
 */
calendarExpanded: boolean
```

- [ ] **Step 2: Add the default**

In `getDefaultSettings()` in `src/main/storage/models/_rowMappers.ts`, inside `layout`:

```ts
      columnsCollapsed: {active: false, discarded: false, done: false},
      calendarExpanded: true,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck:all`
Expected: PASS for main, render, shared. (Existing settings are deep-merged with defaults in `rowToSettings`, so old persisted settings pick up `calendarExpanded: true` automatically — no migration.)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/storage.ts src/main/storage/models/_rowMappers.ts
git commit -m "feat: add layout.calendarExpanded setting"
```

---

### Task 3: `ui.store` toggle

**Files:**

- Modify: `src/renderer/src/stores/ui.store.ts`
- Test: `tests/renderer/stores/ui.store.test.ts`

Read `src/renderer/src/composables/useSettingsValue.ts` and the existing `tests/renderer/stores/ui.store.test.ts` first; mirror their patterns exactly.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe` in `tests/renderer/stores/ui.store.test.ts` (adapt the store-creation boilerplate to match the file's existing tests — same `mockBridgeIPC`/`setActivePinia` setup):

```ts
it("calendarExpanded defaults to true and toggleCalendarExpanded flips it", async () => {
  const store = useUIStore()
  await new Promise((r) => setTimeout(r, 0)) // let settings load

  expect(store.calendarExpanded).toBe(true)

  store.toggleCalendarExpanded()
  expect(store.calendarExpanded).toBe(false)

  store.toggleCalendarExpanded()
  expect(store.calendarExpanded).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm evitest run tests/renderer/stores/ui.store.test.ts`
Expected: FAIL — `store.calendarExpanded` is undefined

- [ ] **Step 3: Implement in `ui.store.ts`**

Next to the other `useSettingValue` calls:

```ts
const calendarExpanded = useSettingValue("layout.calendarExpanded", true)
```

Among the action functions (public ordering: place near `toggleTasksViewMode`):

```ts
function toggleCalendarExpanded() {
  calendarExpanded.value = !calendarExpanded.value
}
```

Add `calendarExpanded` to the returned state block and `toggleCalendarExpanded` to the returned actions block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/stores/ui.store.test.ts`
Expected: PASS (all, including pre-existing)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/ui.store.ts tests/renderer/stores/ui.store.test.ts
git commit -m "feat: add calendarExpanded toggle to ui store"
```

---

### Task 4: Expose `loadedRange` / `extendRange` from tasks store

**Files:**

- Modify: `src/renderer/src/stores/tasks.store.ts` (return block, ~line 361)
- Test: `tests/renderer/stores/tasks.store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe("tasksStore", ...)` in `tests/renderer/stores/tasks.store.test.ts`:

```ts
it("exposes loadedRange after the initial load", async () => {
  const store = await getStore()
  await store.getTaskList()

  expect(store.loadedRange).not.toBeNull()
  expect(store.loadedRange.from < store.loadedRange.to).toBe(true)
})

it("extendRange('future') pushes loadedRange.to forward", async () => {
  const store = await getStore()
  await store.getTaskList()
  const before = store.loadedRange.to

  await store.extendRange("future")

  expect(store.loadedRange.to > before).toBe(true)
})

it("extendRange('past') pulls loadedRange.from backward", async () => {
  const store = await getStore()
  await store.getTaskList()
  const before = store.loadedRange.from

  await store.extendRange("past")

  expect(store.loadedRange.from < before).toBe(true)
})
```

(ISO dates compare correctly as strings.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm evitest run tests/renderer/stores/tasks.store.test.ts`
Expected: the three new tests FAIL (`loadedRange`/`extendRange` undefined); existing tests PASS

- [ ] **Step 3: Expose from the store**

In the `return {...}` of `useTasksStore`, add `loadedRange` to the state block and `extendRange` to the actions block. No other changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/stores/tasks.store.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/tasks.store.ts tests/renderer/stores/tasks.store.test.ts
git commit -m "feat: expose loadedRange and extendRange from tasks store"
```

---

### Task 5: Footer folder refactor (behavior-preserving)

**Files:**

- Move: `src/renderer/src/ui/views/Main/{fragments}/Footer.vue` → `src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue`
- Create: `src/renderer/src/ui/views/Main/{fragments}/Footer/index.ts`
- Create: `src/renderer/src/ui/views/Main/{fragments}/Footer/WeekStrip.vue`
- Modify: `src/renderer/src/ui/views/Main/Main.vue:12`

The current `Footer.vue` mixes two concerns: the week-strip UI and the global drag&drop pointer tracking. Split: pointer logic + container stay in `Footer.vue`; week-strip UI moves to `WeekStrip.vue` (drop-target highlight passed down as a prop). No visual or behavioral change in this task.

- [ ] **Step 1: Move the file**

```bash
mkdir -p "src/renderer/src/ui/views/Main/{fragments}/Footer"
git mv "src/renderer/src/ui/views/Main/{fragments}/Footer.vue" "src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue"
```

- [ ] **Step 2: Create `index.ts`**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Footer/index.ts
export {default} from "./Footer.vue"
```

- [ ] **Step 3: Create `WeekStrip.vue`** (markup lifted verbatim from the old Footer template; only `dropTargetDate` becomes a prop)

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Footer/WeekStrip.vue -->
<script setup lang="ts">
import {computed} from "vue"
import {useNow} from "@vueuse/core"
import {DateTime} from "luxon"

import {ISODate} from "@shared/types/common"
import {toFullDate} from "@shared/utils/date/formatters"
import {getWeekDays} from "@shared/utils/date/getWeekDays"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"

const props = defineProps<{activeDay: string; dropTargetDate: ISODate | null}>()

const tasksStore = useTasksStore()
const now = useNow()

const week = computed(() => getWeekDays(tasksStore.days, tasksStore.activeDay))
const today = computed(() => DateTime.fromJSDate(now.value).toISODate())

function getBadgeText(activeTasksCount: number) {
  return activeTasksCount > 9 ? "9+" : String(activeTasksCount)
}

function isToday(date: ISODate): boolean {
  return date === today.value
}
</script>

<template>
  <div class="flex h-full w-full min-w-0 items-center justify-between gap-3">
    <div class="flex items-center justify-between gap-1">
      <DayPicker
        hover-mode
        :days="tasksStore.days"
        :active-day="tasksStore.activeDay"
        :selected-day="tasksStore.activeDay"
        @select="tasksStore.setActiveDay"
      >
        <template #trigger="{show}">
          <BaseButton variant="ghost" icon="calendar" class="p-0.5" tooltip="Select day" @mouseenter="show" />
        </template>
      </DayPicker>
    </div>

    <ul class="flex w-full min-w-0 items-center justify-between gap-2">
      <li
        v-for="weekDay in week"
        :key="weekDay.date"
        :data-drop-day="weekDay.date"
        class="relative flex min-w-0 flex-1 items-center justify-center rounded-lg border px-2 py-1 font-semibold transition-all duration-150"
        :class="[
          props.dropTargetDate === weekDay.date
            ? 'ring-accent border-accent scale-105 ring-1'
            : weekDay.date === props.activeDay
              ? isToday(weekDay.date)
                ? 'text-accent bg-accent/15 border-accent'
                : 'text-accent bg-base-100 border-accent/50'
              : isToday(weekDay.date)
                ? 'border-accent'
                : 'bg-base-200 text-base-content/80 border-transparent',
        ]"
        @click="tasksStore.setActiveDay(weekDay.date)"
      >
        <div
          class="bg-accent absolute top-0 left-0 z-10 w-1 rounded-l-md transition-all duration-200"
          :class="[isToday(weekDay.date) ? 'h-full opacity-100' : 'h-0 opacity-0']"
        />
        <span class="truncate text-[10px]">{{ toFullDate(weekDay.date) }}</span>

        <span
          v-if="weekDay.day?.tasks.length"
          class="ml-auto flex size-4 items-center justify-center gap-1 rounded-md"
          :class="[weekDay.day.countActive === 0 ? 'text-base-100 bg-success/50' : 'text-warning bg-warning/10']"
        >
          <BaseIcon v-if="weekDay.day.countActive === 0" name="check" class="size-4" />
          <span v-else class="text-[10px]">{{ getBadgeText(weekDay.day.countActive) }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 4: Rewrite `Footer/Footer.vue`** (pointer logic kept verbatim, template delegates to WeekStrip)

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue -->
<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from "vue"

import {ISODate} from "@shared/types/common"
import {useTasksStore} from "@/stores/tasks.store"
import {draggingTaskId} from "@/composables/useTaskDragDrop"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import WeekStrip from "./WeekStrip.vue"

const props = defineProps<{activeDay: string}>()

const tasksStore = useTasksStore()

const dropTargetDate = ref<ISODate | null>(null)
const pendingDrop = ref<{taskId: string; date: ISODate} | null>(null)

function onPointerMove(event: PointerEvent) {
  const {clientX, clientY} = event
  const dayEl = findClosestAtPoint(clientX, clientY, "[data-drop-day]")
  const dragClone = findDragClone()

  const isOverFooter = Boolean(findClosestAtPoint(clientX, clientY, ".app-footer") || findClosestAtPoint(clientX, clientY, "[data-popup]"))

  if (isOverFooter) {
    dragClone?.classList.add("is-over-footer")
  } else {
    dragClone?.classList.remove("is-over-footer")
  }

  if (dayEl) {
    const date = dayEl.dataset.dropDay as ISODate
    dropTargetDate.value = date
    pendingDrop.value = {taskId: draggingTaskId.value!, date}
  } else {
    dropTargetDate.value = null
    pendingDrop.value = null
  }
}

function onPointerUp() {
  if (pendingDrop.value) {
    const {taskId, date} = pendingDrop.value
    pendingDrop.value = null
    dropTargetDate.value = null
    if (date !== props.activeDay) {
      tasksStore.moveTask(taskId, date)
    }
  }
  cleanup()
}

function cleanup() {
  window.removeEventListener("pointermove", onPointerMove)
  window.removeEventListener("pointerup", onPointerUp, true)
  dropTargetDate.value = null
  pendingDrop.value = null
  findDragClone()?.classList.remove("is-over-footer")
}

watch(draggingTaskId, (id) => {
  if (id) {
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp, true)
  } else {
    cleanup()
  }
})

onBeforeUnmount(cleanup)
</script>

<template>
  <div class="app-footer border-base-300 h-header border-t px-4">
    <WeekStrip :active-day="props.activeDay" :drop-target-date="dropTargetDate" />
  </div>
</template>
```

- [ ] **Step 5: Update the import in `Main.vue`**

```ts
import Footer from "./{fragments}/Footer"
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck:render && pnpm lint && pnpm evitest run --project renderer`
Expected: all PASS (pure refactor — no test changes needed)

- [ ] **Step 7: Commit**

```bash
git add -A "src/renderer/src/ui/views/Main/{fragments}/Footer" src/renderer/src/ui/views/Main/Main.vue
git commit -m "refactor: split Footer into folder with WeekStrip fragment"
```

---

### Task 6: `ContinuousCalendar.vue` — static lattice rendering

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue`
- Test: `tests/renderer/components/ContinuousCalendar.test.ts`

Renders chunks from `tasksStore.loadedRange`, day cells with dots, today/active styling, dimming relative to a focus month (static = today's month for now; Task 8 makes it follow the scroll). No scroll logic yet.

- [ ] **Step 1: Write the failing component test**

```ts
// tests/renderer/components/ContinuousCalendar.test.ts
// @ts-nocheck
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {useTasksStore} from "@renderer/stores/tasks.store"
import ContinuousCalendar from "@renderer/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue"
import {DAYS_PER_CHUNK} from "@renderer/ui/views/Main/{fragments}/Footer/lattice"
import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()

vi.mock("@renderer/utils/ui/vue", () => ({toRawDeep: (v) => v}))
vi.mock("@renderer/utils/perf", () => ({perfMark: vi.fn(), perfMeasure: vi.fn()}))
vi.mock("@renderer/api", () => ({
  API: {
    getDays: vi.fn().mockResolvedValue([]),
    getDay: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue(null),
  },
}))

describe("ContinuousCalendar", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountCalendar(days = []) {
    API.getDays.mockResolvedValueOnce(days)
    const store = useTasksStore()
    await new Promise((r) => setTimeout(r, 0))
    await store.getTaskList()
    const wrapper = mount(ContinuousCalendar, {props: {activeDay: TODAY, dropTargetDate: null}})
    return {store, wrapper}
  }

  it("renders every loaded date exactly once, including today", async () => {
    const {wrapper} = await mountCalendar()
    const cells = wrapper.findAll("[data-drop-day]")

    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length % DAYS_PER_CHUNK).toBe(0)

    const dates = cells.map((cell) => cell.attributes("data-drop-day"))
    expect(new Set(dates).size).toBe(dates.length)
    expect(dates).toContain(TODAY)
  })

  it("selects a day on click", async () => {
    const {store, wrapper} = await mountCalendar()
    const target = DateTime.now().plus({days: 1}).toISODate()

    await wrapper.find(`[data-drop-day="${target}"]`).trigger("click")

    expect(store.activeDay).toBe(target)
  })

  it("shows a warning dot for days with active tasks and a success dot for completed days", async () => {
    const activeDay = {date: TODAY, tasks: [{id: "t1", status: "active", tags: []}], tags: [], countActive: 1, countDone: 0}
    const doneDate = DateTime.now().plus({days: 2}).toISODate()
    const doneDay = {date: doneDate, tasks: [{id: "t2", status: "done", tags: []}], tags: [], countActive: 0, countDone: 1}

    const {wrapper} = await mountCalendar([activeDay, doneDay])

    expect(wrapper.find(`[data-drop-day="${TODAY}"] .bg-warning`).exists()).toBe(true)
    expect(wrapper.find(`[data-drop-day="${doneDate}"] .bg-success`).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm evitest run tests/renderer/components/ContinuousCalendar.test.ts`
Expected: FAIL — cannot resolve `ContinuousCalendar.vue`

- [ ] **Step 3: Implement the component**

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue -->
<script setup lang="ts">
import {computed, ref} from "vue"
import {useNow} from "@vueuse/core"
import {DateTime, Info} from "luxon"

import {ISODate} from "@shared/types/common"
import {toMonthYear} from "@shared/utils/date/formatters"
import {useTasksStore} from "@/stores/tasks.store"

import {buildChunkRange, CELL_SIZE, CHUNK_PADDING_X, dayOfMonth, getDayDotStatus, monthKey} from "./lattice"

import type {LatticeChunk} from "./lattice"

const props = defineProps<{activeDay: string; dropTargetDate: ISODate | null}>()

const tasksStore = useTasksStore()
const now = useNow()

const scrollEl = ref<HTMLElement | null>(null)
const today = computed(() => DateTime.fromJSDate(now.value).toISODate()!)
const focusMonth = ref(monthKey(DateTime.now().toISODate()!))

const weekdayLabels = Info.weekdays("short").map((label) => label.slice(0, 2))
const gridStyle = {gridTemplateColumns: `repeat(7, ${CELL_SIZE}px)`}
const chunkPaddingStyle = {paddingLeft: `${CHUNK_PADDING_X}px`, paddingRight: `${CHUNK_PADDING_X}px`}

const daysMap = computed(() => new Map(tasksStore.days.map((day) => [day.date, day])))

const chunks = computed<LatticeChunk[]>(() => {
  const range = tasksStore.loadedRange
  if (!range) return []
  return buildChunkRange(range.from, range.to)
})

function onCellClick(date: ISODate) {
  tasksStore.setActiveDay(date)
}

function dotFor(date: ISODate): "active" | "done" | null {
  return getDayDotStatus(daysMap.value.get(date))
}

function isFocusMonth(date: ISODate): boolean {
  return monthKey(date) === focusMonth.value
}

function cellClass(date: ISODate): string[] {
  const state =
    props.dropTargetDate === date
      ? "ring-accent border-accent ring-1"
      : date === props.activeDay
        ? "text-accent bg-accent/15 border-accent/50"
        : date === today.value
          ? "border-accent"
          : "border-transparent"

  return [state, isFocusMonth(date) ? "opacity-100" : "opacity-40"]
}
</script>

<template>
  <div ref="scrollEl" class="h-full overflow-x-auto overflow-y-hidden" style="overflow-anchor: none">
    <div class="flex h-full w-max">
      <section v-for="chunk in chunks" :key="chunk.index" class="flex h-full flex-col" :style="chunkPaddingStyle">
        <div
          class="text-base-content/80 truncate text-center text-[11px] font-semibold transition-opacity duration-150"
          :class="isFocusMonth(chunk.middleDate) ? 'opacity-100' : 'opacity-40'"
        >
          {{ toMonthYear(chunk.middleDate) }}
        </div>

        <div class="grid" :style="gridStyle">
          <span v-for="label in weekdayLabels" :key="label" class="text-base-content/50 text-center text-[9px]">{{ label }}</span>
        </div>

        <div v-for="(weekRow, rowIndex) in chunk.weeks" :key="`${chunk.index}-${rowIndex}`" class="grid flex-1" :style="gridStyle">
          <button
            v-for="date in weekRow"
            :key="date"
            :data-drop-day="date"
            class="flex flex-col items-center justify-center rounded-md border transition-opacity duration-150"
            :class="cellClass(date)"
            @click="onCellClick(date)"
          >
            <span class="text-[11px] font-semibold">{{ dayOfMonth(date) }}</span>
            <span class="size-1 rounded-full" :class="dotFor(date) === 'active' ? 'bg-warning' : dotFor(date) === 'done' ? 'bg-success' : ''" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/components/ContinuousCalendar.test.ts`
Expected: PASS (all 3)

- [ ] **Step 5: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue" tests/renderer/components/ContinuousCalendar.test.ts
git commit -m "feat: add ContinuousCalendar lattice component"
```

---

### Task 7: Collapsible footer shell — chevron + reactive heights

**Files:**

- Modify: `src/renderer/src/ui/views/Main/model/useContentSize.ts`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue`

- [ ] **Step 1: Make footer height reactive in `useContentSize.ts`** (full new content)

```ts
// src/renderer/src/ui/views/Main/model/useContentSize.ts
import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {useUIStore} from "@/stores/ui.store"

export const FOOTER_HEIGHT = 40
export const FOOTER_EXPANDED_HEIGHT = 260

const HEADER_HEIGHT = 62

export function useContentSize(contentId: string) {
  const uiStore = useUIStore()
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const footerHeight = computed(() => (uiStore.calendarExpanded ? FOOTER_EXPANDED_HEIGHT : FOOTER_HEIGHT))
  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight.value)
  const contentWidth = computed(() => width.value)

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight, footerHeight}
}
```

(`Main.vue` needs no change: `footerHeight` unwraps in the template, and `v-if="footerHeight > 0"` keeps working.)

- [ ] **Step 2: Switch states in `Footer/Footer.vue`**

Script: add imports and the height computed —

```ts
import {computed, onBeforeUnmount, ref, watch} from "vue"

import {useUIStore} from "@/stores/ui.store"
import BaseButton from "@/ui/base/BaseButton.vue"

import {FOOTER_EXPANDED_HEIGHT, FOOTER_HEIGHT} from "../../model/useContentSize"
import ContinuousCalendar from "./ContinuousCalendar.vue"
```

```ts
const uiStore = useUIStore()
const footerHeight = computed(() => (uiStore.calendarExpanded ? FOOTER_EXPANDED_HEIGHT : FOOTER_HEIGHT))
```

Template (replaces the previous one; pointer logic in the script stays untouched — `dropTargetDate` now feeds both children):

```vue
<template>
  <div class="app-footer border-base-300 border-t px-4" :style="{height: `${footerHeight}px`}">
    <div v-if="!uiStore.calendarExpanded" class="flex h-full w-full items-center justify-between gap-2">
      <WeekStrip :active-day="props.activeDay" :drop-target-date="dropTargetDate" />
      <BaseButton variant="ghost" icon="chevron-up" class="p-0.5" tooltip="Expand calendar" @click="uiStore.toggleCalendarExpanded()" />
    </div>

    <div v-else class="flex h-full w-full items-stretch gap-1 py-1">
      <ContinuousCalendar :active-day="props.activeDay" :drop-target-date="dropTargetDate" class="min-w-0 flex-1" />
      <div class="flex flex-col">
        <BaseButton variant="ghost" icon="chevron-down" class="p-0.5" tooltip="Collapse calendar" @click="uiStore.toggleCalendarExpanded()" />
      </div>
    </div>
  </div>
</template>
```

Note the `h-header` class is removed from the root — height now comes from the inline style.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck:render && pnpm evitest run --project renderer`
Expected: PASS

Run: `pnpm dev` — manually confirm: footer opens expanded (260px) showing the lattice; chevron collapses to the old strip; the choice survives an app restart; tasks area resizes correctly in both states.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ui/views/Main/model/useContentSize.ts "src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue"
git commit -m "feat: collapsible footer with continuous calendar"
```

---

### Task 8: Scroll behavior — `useCalendarScroll.ts`

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Footer/useCalendarScroll.ts`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue`

The pure math (`dateAtViewportCenter`, `scrollLeftForDate`) is already unit-tested in Task 1; this composable is thin DOM glue (event listeners, rAF, scrollLeft writes) and is verified manually — happy-dom has no real layout, so scroll metrics are always 0 there.

- [ ] **Step 1: Implement the composable**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Footer/useCalendarScroll.ts
import {onBeforeUnmount, onMounted, watch} from "vue"

import {CHUNK_WIDTH, dateAtViewportCenter, scrollLeftForDate} from "./lattice"

import type {ISODate} from "@shared/types/common"
import type {Ref} from "vue"

const EDGE_THRESHOLD_PX = CHUNK_WIDTH * 1.5

export function useCalendarScroll(params: {
  scrollEl: Ref<HTMLElement | null>
  firstChunkIndex: Ref<number | null>
  onFocusDateChange: (date: ISODate) => void
  onReachEdge: (direction: "past" | "future") => void
}) {
  const {scrollEl, firstChunkIndex} = params
  let rafId: number | null = null

  function scrollToDate(date: ISODate, behavior: ScrollBehavior = "smooth") {
    const el = scrollEl.value
    if (!el || firstChunkIndex.value === null) return

    const left = scrollLeftForDate({date, firstChunkIndex: firstChunkIndex.value, clientWidth: el.clientWidth})
    if (typeof el.scrollTo === "function") el.scrollTo({left, behavior})
    else el.scrollLeft = left
  }

  function onScroll() {
    if (rafId !== null) return

    rafId = requestAnimationFrame(() => {
      rafId = null
      const el = scrollEl.value
      if (!el || firstChunkIndex.value === null) return

      params.onFocusDateChange(dateAtViewportCenter({scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, firstChunkIndex: firstChunkIndex.value}))

      if (el.scrollLeft < EDGE_THRESHOLD_PX) {
        params.onReachEdge("past")
      } else if (el.scrollWidth - el.scrollLeft - el.clientWidth < EDGE_THRESHOLD_PX) {
        params.onReachEdge("future")
      }
    })
  }

  // Chunks prepended to the past shift content right; compensate synchronously
  // (flush: "post" = after DOM patch, before paint) so the viewport doesn't jump.
  watch(
    firstChunkIndex,
    (next, prev) => {
      const el = scrollEl.value
      if (!el || next === null || prev === null || prev === undefined) return
      if (next < prev) el.scrollLeft += (prev - next) * CHUNK_WIDTH
    },
    {flush: "post"},
  )

  onMounted(() => {
    scrollEl.value?.addEventListener("scroll", onScroll, {passive: true})
  })

  onBeforeUnmount(() => {
    scrollEl.value?.removeEventListener("scroll", onScroll)
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return {scrollToDate}
}
```

- [ ] **Step 2: Wire it into `ContinuousCalendar.vue`**

Script additions (imports merge into the existing lines):

```ts
import {computed, nextTick, onMounted, ref, watch} from "vue"

import {useCalendarScroll} from "./useCalendarScroll"
```

After the `chunks` computed:

```ts
const firstChunkIndex = computed(() => chunks.value[0]?.index ?? null)
let suppressFollow = false

const {scrollToDate} = useCalendarScroll({
  scrollEl,
  firstChunkIndex,
  onFocusDateChange: (date) => (focusMonth.value = monthKey(date)),
  onReachEdge: (direction) => void tasksStore.extendRange(direction),
})

function scrollToToday() {
  scrollToDate(today.value, "smooth")
}

watch(
  () => tasksStore.activeDay,
  (date) => {
    if (suppressFollow) {
      suppressFollow = false
      return
    }
    scrollToDate(date, "smooth")
  },
)

onMounted(async () => {
  await nextTick()
  scrollToDate(today.value, "auto")
})

defineExpose({scrollToToday})
```

Change `onCellClick` so clicking inside the lattice doesn't trigger the follow-scroll:

```ts
function onCellClick(date: ISODate) {
  suppressFollow = true
  tasksStore.setActiveDay(date)
}
```

- [ ] **Step 3: Add the "scroll to today" button to `Footer/Footer.vue`**

Script additions:

```ts
import ContinuousCalendar from "./ContinuousCalendar.vue"

const calendarRef = ref<InstanceType<typeof ContinuousCalendar> | null>(null)
```

Expanded branch of the template becomes:

```vue
    <div v-else class="flex h-full w-full items-stretch gap-1 py-1">
      <div class="flex flex-col">
        <BaseButton variant="ghost" icon="calendar" class="p-0.5" tooltip="Scroll to today" @click="calendarRef?.scrollToToday()" />
      </div>
      <ContinuousCalendar ref="calendarRef" :active-day="props.activeDay" :drop-target-date="dropTargetDate" class="min-w-0 flex-1" />
      <div class="flex flex-col">
        <BaseButton variant="ghost" icon="chevron-down" class="p-0.5" tooltip="Collapse calendar" @click="uiStore.toggleCalendarExpanded()" />
      </div>
    </div>
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck:render && pnpm evitest run --project renderer`
Expected: PASS (existing component tests stay green — scroll metrics are 0 in happy-dom, the guards keep mounting safe)

Run: `pnpm dev` — manually confirm each item:

1. On launch the lattice is centered on today; today's month is undimmed, neighbors dimmed.
2. Scrolling left/right migrates the dimming smoothly as month centers pass the viewport center.
3. Scrolling far left/right keeps loading more months (console logs `[TASKS] Extended range ...`) with **no visible jump** when past chunks prepend.
4. Calendar icon scrolls back to today.
5. Clicking a day opens its tasks above and the lattice stays put; picking a day via search or the collapsed-mode DayPicker scrolls the lattice to it.
6. Dragging a task onto a lattice cell (any month) moves it; the cell highlights with the accent ring during hover.

- [ ] **Step 5: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Footer"
git commit -m "feat: continuous calendar scrolling with focus month and edge loading"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the full gate**

Run: `pnpm check:all`
Expected: lint, all three typechecks, circular-dependency check, and the full test suite PASS.

- [ ] **Step 2: Manual regression sweep** (`pnpm dev`)

1. Collapsed mode is pixel-identical to the old footer (DayPicker popover included) plus the expand chevron.
2. Expand → collapse → restart the app: the state persists (`layout.calendarExpanded`).
3. Switch branches: lattice re-renders around today without errors.
4. Resize the window: both states keep the tasks area correctly sized.

- [ ] **Step 3: Commit any fixes, then report**

If verification surfaced fixes, commit them as `fix:` commits. Implementation is complete when `check:all` and the manual sweep both pass.
