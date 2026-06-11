# Calendar Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the continuous calendar from the footer into a collapsible left sidebar in vertical orientation with BaseCalendar's visual language, and revert the footer to the original week strip — per `docs/superpowers/specs/2026-06-11-calendar-sidebar-design.md`.

**Architecture:** New pure math `weekLattice.ts` (epoch-anchored week rows — no chunks needed vertically). `CalendarSidebar.vue` renders a sticky header (focus month, ±month chevrons, today, collapse) plus an infinite vertical `grid-cols-7` stack of BaseCalendar-styled cells; a Y-axis `useCalendarScroll.ts` carries over v1's scroll mechanics (rAF focus detection, edge extension with scrollTop compensation, queued scroll). The drag&drop pointer tracking moves out of Footer into a shared `useDayDropTarget` composable consumed by both the week strip and the sidebar. The v1 footer calendar (ContinuousCalendar, lattice.ts, `layout.calendarExpanded`) is torn down.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Luxon, TailwindCSS 4, vitest (`pnpm evitest`), @vue/test-utils + happy-dom.

**Conventions for every task:** `type` over `interface`; exported symbols before private helpers; no Co-Authored-By lines in commits; `{fragments}` directory name contains literal braces — quote paths in shell. ⚠️ GIT SAFETY: never `git checkout <sha>` / `git switch --detach` (это уже теряло работу на этой ветке); inspect history only via `git show` / `git diff`.

---

## File map

| File                                                                       | Action | Responsibility                                                   |
| -------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `src/renderer/src/ui/views/Main/{fragments}/Sidebar/weekLattice.ts`        | Create | Pure math: epoch week rows, viewport ↔ date (Y axis), dot status |
| `tests/renderer/utils/weekLattice.test.ts`                                 | Create | Unit tests for week math                                         |
| `src/renderer/src/stores/ui.store.ts`                                      | Modify | `sidebarCollapsed` + toggle (replaces `calendarExpanded`)        |
| `tests/renderer/stores/ui.store.test.ts`                                   | Modify | Toggle test (replaces calendarExpanded test)                     |
| `src/renderer/src/composables/useDayDropTarget.ts`                         | Create | Shared drag&drop pointer tracking (`dropTargetDate`)             |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue`             | Modify | Revert to single-state week strip, consume shared composable     |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue` | Delete | v1 footer lattice                                                |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/useCalendarScroll.ts`   | Delete | v1 X-axis scroll glue                                            |
| `src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts`             | Delete | v1 chunk math                                                    |
| `tests/renderer/components/ContinuousCalendar.test.ts`                     | Delete | v1 tests                                                         |
| `tests/renderer/utils/calendarLattice.test.ts`                             | Delete | v1 tests                                                         |
| `src/shared/types/storage.ts`                                              | Modify | Remove `layout.calendarExpanded`                                 |
| `src/main/storage/models/_rowMappers.ts`                                   | Modify | Remove `calendarExpanded` default                                |
| `src/renderer/src/ui/views/Main/{fragments}/Sidebar/CalendarSidebar.vue`   | Create | Sidebar: header + weekday row + week stack                       |
| `src/renderer/src/ui/views/Main/{fragments}/Sidebar/useCalendarScroll.ts`  | Create | Y-axis scroll glue                                               |
| `src/renderer/src/ui/views/Main/{fragments}/Sidebar/index.ts`              | Create | `export {default} from "./CalendarSidebar.vue"`                  |
| `tests/renderer/components/CalendarSidebar.test.ts`                        | Create | Component behavior tests                                         |
| `src/renderer/src/ui/views/Main/Main.vue`                                  | Modify | Mount sidebar + activate drop-target composable                  |
| `src/renderer/src/ui/views/Main/{fragments}/Header.vue`                    | Modify | Reopen button + conditional `ml-traffic-light`                   |
| `src/renderer/src/ui/views/Main/model/useContentSize.ts`                   | Modify | Footer back to constant 40; subtract sidebar width               |

Reference styles live in `src/renderer/src/ui/base/BaseCalendar/BaseCalendar.vue` (cells, dots, header) and `src/renderer/src/ui/base/BaseCalendar/constants.ts` (`WEEKDAYS`). The drag-clone CSS class `is-over-footer` is defined in `src/renderer/src/assets/styles/rewrites/vue-draggable.css` — keep the class name.

---

### Task 1: Week math (`weekLattice.ts`)

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Sidebar/weekLattice.ts`
- Test: `tests/renderer/utils/weekLattice.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/renderer/utils/weekLattice.test.ts
import {describe, expect, it} from "vitest"

import {
  buildWeek,
  buildWeekRange,
  dateAtViewportCenter,
  dayOfMonth,
  getDayDotStatus,
  LATTICE_EPOCH,
  monthKey,
  ROW_HEIGHT,
  scrollTopForDate,
  weekIndexForDate,
} from "@renderer/ui/views/Main/{fragments}/Sidebar/weekLattice"

describe("week math", () => {
  it("anchors week 0 at the epoch Monday", () => {
    expect(weekIndexForDate(LATTICE_EPOCH)).toBe(0)
    expect(buildWeek(0).days[0]).toBe("2001-01-01")
    expect(buildWeek(0).days[6]).toBe("2001-01-07")
  })

  it("handles dates before the epoch", () => {
    expect(weekIndexForDate("2000-12-31")).toBe(-1)
    expect(buildWeek(-1).days[6]).toBe("2000-12-31")
  })

  it("keeps a month boundary inside a single row", () => {
    // June→July 2026: the row must read Mon Jun 29 .. Sun Jul 5
    const week = buildWeek(weekIndexForDate("2026-06-29"))
    expect(week.days[0]).toBe("2026-06-29")
    expect(week.days[6]).toBe("2026-07-05")
  })

  it("renders every date exactly once and gaplessly across a range", () => {
    const weeks = buildWeekRange("2025-12-15", "2026-07-15")
    const all = weeks.flatMap((week) => week.days)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(weeks.length * 7)
    expect(all).toContain("2025-12-15")
    expect(all).toContain("2026-07-15")
  })
})

describe("viewport math", () => {
  it("returns the Thursday of the centered row", () => {
    const first = weekIndexForDate("2026-06-11")
    const date = dateAtViewportCenter({scrollTop: 0, clientHeight: ROW_HEIGHT, firstWeekIndex: first})
    expect(date).toBe(buildWeek(first).days[3])
  })

  it("scrollTopForDate centers the row containing the date", () => {
    const first = 100
    const target = buildWeek(108).days[3]
    const scrollTop = scrollTopForDate({date: target, firstWeekIndex: first, clientHeight: ROW_HEIGHT * 11})
    expect(dateAtViewportCenter({scrollTop, clientHeight: ROW_HEIGHT * 11, firstWeekIndex: first})).toBe(target)
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

Run: `pnpm evitest run tests/renderer/utils/weekLattice.test.ts`
Expected: FAIL — cannot resolve `.../Sidebar/weekLattice`

- [ ] **Step 3: Implement `weekLattice.ts`**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Sidebar/weekLattice.ts
import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

/** Week-row pitch in px: h-9 cell (36) + gap-1 (4); drives all viewport math */
export const ROW_HEIGHT = 40
/** Fixed epoch Monday; week indices never move relative to it */
export const LATTICE_EPOCH: ISODate = "2001-01-01"

export type DayDotStatus = "active" | "done"

export type WeekRow = {
  index: number
  /** 7 ISO dates, Monday-first */
  days: ISODate[]
}

export function weekIndexForDate(date: ISODate): number {
  return Math.floor(daysFromEpoch(date) / 7)
}

export function buildWeek(index: number): WeekRow {
  const start = EPOCH_DATE.plus({days: index * 7})
  const days: ISODate[] = []
  for (let col = 0; col < 7; col++) {
    days.push(start.plus({days: col}).toISODate()!)
  }
  return {index, days}
}

export function buildWeekRange(from: ISODate, to: ISODate): WeekRow[] {
  const weeks: WeekRow[] = []
  for (let i = weekIndexForDate(from); i <= weekIndexForDate(to); i++) {
    weeks.push(buildWeek(i))
  }
  return weeks
}

export function getDayDotStatus(day: Day | null | undefined): DayDotStatus | null {
  if (!day || day.tasks.length === 0) return null
  return day.countActive > 0 ? "active" : "done"
}

/** Date at the vertical center of the viewport (Thursday of the centered row — majority-of-week month rule) */
export function dateAtViewportCenter(params: {scrollTop: number; clientHeight: number; firstWeekIndex: number}): ISODate {
  const centerY = params.scrollTop + params.clientHeight / 2
  const rowOffset = Math.floor(centerY / ROW_HEIGHT)
  const dayOffset = (params.firstWeekIndex + rowOffset) * 7 + 3

  return EPOCH_DATE.plus({days: dayOffset}).toISODate()!
}

/** scrollTop that vertically centers the week row containing the date */
export function scrollTopForDate(params: {date: ISODate; firstWeekIndex: number; clientHeight: number}): number {
  const rowOffset = weekIndexForDate(params.date) - params.firstWeekIndex
  return Math.max(0, rowOffset * ROW_HEIGHT - (params.clientHeight - ROW_HEIGHT) / 2)
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}

const EPOCH_DATE = DateTime.fromISO(LATTICE_EPOCH)

function daysFromEpoch(date: ISODate): number {
  return Math.round(DateTime.fromISO(date).diff(EPOCH_DATE, "days").days)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/utils/weekLattice.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Sidebar/weekLattice.ts" tests/renderer/utils/weekLattice.test.ts
git commit -m "feat: add week lattice math for the calendar sidebar"
```

---

### Task 2: `ui.store` sidebar toggle

**Files:**

- Modify: `src/renderer/src/stores/ui.store.ts`
- Test: `tests/renderer/stores/ui.store.test.ts`

The persisted field `Settings.sidebar.collapsed` already exists (default `false`). Bind it exactly like the other `useSettingValue` usages. (Removal of the obsolete `calendarExpanded` binding happens in Task 3 — do not touch it here.)

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe` in `tests/renderer/stores/ui.store.test.ts`, using the file's existing `getStore()`-style boilerplate:

```ts
it("sidebarCollapsed defaults to false and toggleSidebarCollapsed flips it", async () => {
  const store = useUIStore()
  await new Promise((r) => setTimeout(r, 0)) // let settings load

  expect(store.sidebarCollapsed).toBe(false)

  store.toggleSidebarCollapsed()
  expect(store.sidebarCollapsed).toBe(true)

  store.toggleSidebarCollapsed()
  expect(store.sidebarCollapsed).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm evitest run tests/renderer/stores/ui.store.test.ts`
Expected: new test FAILS (`sidebarCollapsed` undefined); existing tests PASS

- [ ] **Step 3: Implement in `ui.store.ts`**

Next to the other `useSettingValue` calls:

```ts
const sidebarCollapsed = useSettingValue("sidebar.collapsed", false)
```

Among the actions (near `toggleCalendarExpanded`):

```ts
function toggleSidebarCollapsed() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
```

Add `sidebarCollapsed` to the returned state block and `toggleSidebarCollapsed` to the returned actions block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/stores/ui.store.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/ui.store.ts tests/renderer/stores/ui.store.test.ts
git commit -m "feat: add sidebarCollapsed toggle to ui store"
```

---

### Task 3: Drag&drop extraction + v1 footer-calendar teardown

**Files:**

- Create: `src/renderer/src/composables/useDayDropTarget.ts`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue` (full rewrite below)
- Modify: `src/renderer/src/ui/views/Main/Main.vue` (Footer usage + composable activation)
- Modify: `src/renderer/src/ui/views/Main/model/useContentSize.ts` (full rewrite below)
- Modify: `src/renderer/src/stores/ui.store.ts` (remove `calendarExpanded` binding + toggle)
- Modify: `src/shared/types/storage.ts` (remove `calendarExpanded` field)
- Modify: `src/main/storage/models/_rowMappers.ts` (remove `calendarExpanded` default)
- Modify: `tests/renderer/stores/ui.store.test.ts` (remove the calendarExpanded test)
- Delete: `src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue`
- Delete: `src/renderer/src/ui/views/Main/{fragments}/Footer/useCalendarScroll.ts`
- Delete: `src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts`
- Delete: `tests/renderer/components/ContinuousCalendar.test.ts`
- Delete: `tests/renderer/utils/calendarLattice.test.ts`

The pointer-tracking logic moves verbatim from `Footer.vue` into a shared composable with one behavioral extension: the drag-clone zone check also matches `.app-sidebar` (the sidebar arrives in Task 6). `dropTargetDate` becomes a module-level ref so the footer and the future sidebar share one instance.

- [ ] **Step 1: Create `useDayDropTarget.ts`**

```ts
// src/renderer/src/composables/useDayDropTarget.ts
import {onScopeDispose, ref, watch} from "vue"

import {useTasksStore} from "@/stores/tasks.store"
import {draggingTaskId} from "@/composables/useTaskDragDrop"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import type {ISODate} from "@shared/types/common"

/**
 * Shared by every day-cell surface (footer week strip, calendar sidebar, popups).
 * DOM contract: droppable day cells inside `.app-footer`, `.app-sidebar`, or
 * `[data-popup]` must render `data-drop-day="<ISODate>"`.
 */
export const dropTargetDate = ref<ISODate | null>(null)

/** Activate the global pointer tracking. Call once from Main.vue. */
export function useDayDropTarget() {
  const tasksStore = useTasksStore()
  const pendingDrop = ref<{taskId: string; date: ISODate} | null>(null)

  function onPointerMove(event: PointerEvent) {
    const {clientX, clientY} = event
    const dayEl = findClosestAtPoint(clientX, clientY, "[data-drop-day]")
    const dragClone = findDragClone()

    const isOverDropZone = Boolean(
      findClosestAtPoint(clientX, clientY, ".app-footer") ||
      findClosestAtPoint(clientX, clientY, ".app-sidebar") ||
      findClosestAtPoint(clientX, clientY, "[data-popup]"),
    )

    if (isOverDropZone) {
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
      if (date !== tasksStore.activeDay) {
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

  onScopeDispose(cleanup)
}
```

(The `is-over-footer` class name is kept — it is styled in `assets/styles/rewrites/vue-draggable.css` and now means "over a drop zone".) Note `onPointerUp` checks `tasksStore.activeDay` instead of the old `props.activeDay` — same value, since Main passes `tasksStore.activeDay` to Footer.

- [ ] **Step 2: Rewrite `Footer/Footer.vue`** (full file — back to the original single-state strip)

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue -->
<script setup lang="ts">
import {dropTargetDate} from "@/composables/useDayDropTarget"

import WeekStrip from "./WeekStrip.vue"

const props = defineProps<{activeDay: string}>()
</script>

<template>
  <div class="app-footer border-base-300 h-header border-t px-4">
    <WeekStrip :active-day="props.activeDay" :drop-target-date="dropTargetDate" />
  </div>
</template>
```

- [ ] **Step 3: Update `Main.vue`**

Add the composable import and activation in the script:

```ts
import {useDayDropTarget} from "@/composables/useDayDropTarget"
```

```ts
useDayDropTarget()
```

(Place the call next to the existing `useStorageStore()` / `useThemeStore()` calls.) Change the Footer usage back to:

```vue
<Footer v-if="footerHeight > 0" :active-day="tasksStore.activeDay" />
```

- [ ] **Step 4: Rewrite `useContentSize.ts`** (footer height back to a constant; sidebar width arrives in Task 6)

```ts
// src/renderer/src/ui/views/Main/model/useContentSize.ts
import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

const FOOTER_HEIGHT = 40
const HEADER_HEIGHT = 62

export function useContentSize(contentId: string) {
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const footerHeight = FOOTER_HEIGHT
  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight)
  const contentWidth = computed(() => width.value)

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight, footerHeight}
}
```

- [ ] **Step 5: Remove `calendarExpanded` everywhere**

- `src/renderer/src/stores/ui.store.ts`: delete the `calendarExpanded` `useSettingValue` line, the `toggleCalendarExpanded` function, and both entries in the return block.
- `src/shared/types/storage.ts`: delete the `calendarExpanded` field and its JSDoc from `Settings.layout`.
- `src/main/storage/models/_rowMappers.ts`: delete `calendarExpanded: true,` from `getDefaultSettings()`.
- `tests/renderer/stores/ui.store.test.ts`: delete the `"calendarExpanded defaults to true and toggleCalendarExpanded flips it"` test.

- [ ] **Step 6: Delete the v1 files**

```bash
git rm "src/renderer/src/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue" \
       "src/renderer/src/ui/views/Main/{fragments}/Footer/useCalendarScroll.ts" \
       "src/renderer/src/ui/views/Main/{fragments}/Footer/lattice.ts" \
       tests/renderer/components/ContinuousCalendar.test.ts \
       tests/renderer/utils/calendarLattice.test.ts
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck:all && pnpm lint && pnpm evitest run --project renderer`
Expected: all PASS (the deleted tests are gone; remaining suite green — the footer is functionally identical to pre-v1 `main` plus the WeekStrip extraction).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract shared day drop-target tracking and tear down footer calendar"
```

---

### Task 4: `CalendarSidebar.vue` — static vertical calendar

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Sidebar/CalendarSidebar.vue`
- Create: `src/renderer/src/ui/views/Main/{fragments}/Sidebar/index.ts`
- Test: `tests/renderer/components/CalendarSidebar.test.ts`

Static rendering only: header (focus-month label + collapse button), weekday row, continuous week stack with BaseCalendar-styled cells. Focus month is statically today's month; scroll behavior, chevrons, and the today button arrive in Task 5. The component is not mounted anywhere yet (Task 6 wires it into Main.vue) — it is exercised by its tests.

- [ ] **Step 1: Write the failing component test**

```ts
// tests/renderer/components/CalendarSidebar.test.ts
// @ts-nocheck
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {useTasksStore} from "@renderer/stores/tasks.store"
import CalendarSidebar from "@renderer/ui/views/Main/{fragments}/Sidebar/CalendarSidebar.vue"
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

describe("CalendarSidebar", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountSidebar(days = []) {
    API.getDays.mockResolvedValueOnce(days)
    const store = useTasksStore()
    await new Promise((r) => setTimeout(r, 0))
    await store.getTaskList()
    const wrapper = mount(CalendarSidebar, {props: {activeDay: TODAY}})
    return {store, wrapper}
  }

  it("renders every loaded date exactly once, including today", async () => {
    const {wrapper} = await mountSidebar()
    const cells = wrapper.findAll("[data-drop-day]")

    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length % 7).toBe(0)

    const dates = cells.map((cell) => cell.attributes("data-drop-day"))
    expect(new Set(dates).size).toBe(dates.length)
    expect(dates).toContain(TODAY)
  })

  it("selects a day on click", async () => {
    const {store, wrapper} = await mountSidebar()
    const target = DateTime.now().plus({days: 1}).toISODate()

    await wrapper.find(`[data-drop-day="${target}"]`).trigger("click")

    expect(store.activeDay).toBe(target)
  })

  it("shows a warning dot for active days and a success dot for completed days", async () => {
    const activeDay = {date: TODAY, tasks: [{id: "t1", status: "active", tags: []}], tags: [], countActive: 1, countDone: 0}
    const doneDate = DateTime.now().plus({days: 2}).toISODate()
    const doneDay = {date: doneDate, tasks: [{id: "t2", status: "done", tags: []}], tags: [], countActive: 0, countDone: 1}

    const {wrapper} = await mountSidebar([activeDay, doneDay])

    expect(wrapper.find(`[data-drop-day="${TODAY}"] .bg-warning`).exists()).toBe(true)
    expect(wrapper.find(`[data-drop-day="${doneDate}"] .bg-success`).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm evitest run tests/renderer/components/CalendarSidebar.test.ts`
Expected: FAIL — cannot resolve `CalendarSidebar.vue`

- [ ] **Step 3: Implement the component**

```vue
<!-- src/renderer/src/ui/views/Main/{fragments}/Sidebar/CalendarSidebar.vue -->
<script setup lang="ts">
import {computed, ref} from "vue"
import {useNow} from "@vueuse/core"
import {DateTime} from "luxon"

import {toMonthYear} from "@shared/utils/date/formatters"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {dropTargetDate} from "@/composables/useDayDropTarget"
import BaseButton from "@/ui/base/BaseButton.vue"
import {WEEKDAYS} from "@/ui/base/BaseCalendar/constants"

import {buildWeekRange, dayOfMonth, getDayDotStatus, monthKey} from "./weekLattice"

import type {ISODate} from "@shared/types/common"
import type {DayDotStatus, WeekRow} from "./weekLattice"

const props = defineProps<{activeDay: ISODate}>()

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const now = useNow()

const scrollEl = ref<HTMLElement | null>(null)
const today = computed(() => DateTime.fromJSDate(now.value).toISODate()!)
const focusMonth = ref(monthKey(DateTime.now().toISODate()!))

const headerLabel = computed(() => toMonthYear(`${focusMonth.value}-01`))
const daysMap = computed(() => new Map(tasksStore.days.map((day) => [day.date, day])))

const weeks = computed<WeekRow[]>(() => {
  const range = tasksStore.loadedRange
  if (!range) return []
  return buildWeekRange(range.from, range.to)
})

function onCellClick(date: ISODate) {
  if (date === tasksStore.activeDay) return
  tasksStore.setActiveDay(date)
}

function dotClass(date: ISODate): string {
  const dot: DayDotStatus | null = getDayDotStatus(daysMap.value.get(date))
  if (dot === "active") return "bg-warning"
  if (dot === "done") return "bg-success"
  return ""
}

function isFocusMonth(date: ISODate): boolean {
  return monthKey(date) === focusMonth.value
}

function cellClass(date: ISODate): string[] {
  const classes = [isFocusMonth(date) ? "text-base-content" : "text-base-content/50"]

  if (dropTargetDate.value === date) classes.push("ring-accent border-accent ring-1")
  else if (date === props.activeDay) classes.push("bg-accent/30 text-accent hover:bg-accent/40")

  if (date === today.value) classes.push("border-accent border-1")

  return classes
}
</script>

<template>
  <aside class="app-sidebar border-base-300 bg-base-100 flex h-full shrink-0 flex-col border-r">
    <div class="border-base-300 h-header flex shrink-0 items-center border-b px-2" style="-webkit-app-region: drag">
      <div class="ml-traffic-light flex min-w-0 flex-1 items-center justify-between gap-1" style="-webkit-app-region: no-drag">
        <h2 class="truncate text-sm font-semibold capitalize">{{ headerLabel }}</h2>
        <BaseButton variant="ghost" icon="sidebar" class="p-0.5" tooltip="Hide calendar" @click="uiStore.toggleSidebarCollapsed()" />
      </div>
    </div>

    <ul class="grid grid-cols-7 gap-1 px-2 pt-2">
      <li v-for="day in WEEKDAYS" :key="day" class="text-accent/70 py-1 text-center text-sm select-none">{{ day }}</li>
    </ul>
    <div class="border-accent/10 mx-2 mb-1 border-b" />

    <div ref="scrollEl" class="flex-1 overflow-y-auto px-2 pb-2" style="overflow-anchor: none">
      <div class="grid grid-cols-7 gap-1">
        <template v-for="week in weeks" :key="week.index">
          <BaseButton
            v-for="date in week.days"
            :key="date"
            variant="ghost"
            size="md"
            type="button"
            :data-drop-day="date"
            :aria-label="date"
            :aria-current="date === today ? 'date' : undefined"
            class="relative aspect-square h-9 w-full shrink-0 text-sm select-none"
            :class="cellClass(date)"
            @click="onCellClick(date)"
          >
            {{ dayOfMonth(date) }}

            <div v-if="dotClass(date)" class="absolute top-0.5 right-0.5 size-2 rounded-full shadow-xs" :class="dotClass(date)" />
          </BaseButton>
        </template>
      </div>
    </div>
  </aside>
</template>
```

Notes:

- Cell markup mirrors `BaseCalendar.vue:190-207` (ghost BaseButton, `h-9`, corner dot `size-2 top-0.5 right-0.5 shadow-xs`); the dimming is text-color based (`text-base-content/50`), exactly BaseCalendar's `isCurrentMonth` treatment.
- The sidebar header is `h-header` with a bottom border so it aligns with the main `Header`; `ml-traffic-light` clears the macOS window controls (the sidebar is the leftmost full-height panel under `titleBarStyle: hiddenInset`).
- `scrollEl` and `overflow-anchor: none` are inert pre-wiring for Task 5. The width is set by the parent (Task 6) — the component itself is `w-full` content inside a fixed-width aside slot; do not hardcode width here.

- [ ] **Step 4: Create `index.ts`**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Sidebar/index.ts
export {default} from "./CalendarSidebar.vue"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm evitest run tests/renderer/components/CalendarSidebar.test.ts && pnpm typecheck:render`
Expected: PASS (3/3), typecheck clean

- [ ] **Step 6: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Sidebar" tests/renderer/components/CalendarSidebar.test.ts
git commit -m "feat: add CalendarSidebar vertical continuous calendar"
```

---

### Task 5: Y-axis scroll behavior

**Files:**

- Create: `src/renderer/src/ui/views/Main/{fragments}/Sidebar/useCalendarScroll.ts`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Sidebar/CalendarSidebar.vue`

Carries over v1's proven mechanics with the axis swapped. No unit tests for the composable (happy-dom has no layout — scroll metrics are 0; the pure math is already covered by Task 1); the existing component tests must stay green (guards keep mounting safe).

- [ ] **Step 1: Implement the composable**

```ts
// src/renderer/src/ui/views/Main/{fragments}/Sidebar/useCalendarScroll.ts
import {onBeforeUnmount, onMounted, watch} from "vue"

import {dateAtViewportCenter, ROW_HEIGHT, scrollTopForDate} from "./weekLattice"

import type {ISODate} from "@shared/types/common"
import type {Ref} from "vue"

// ~2 months of rows; extendRange adds ~13 rows (3 months), so one extension
// always clears the threshold after compensation.
const EDGE_THRESHOLD_PX = ROW_HEIGHT * 8

export function useCalendarScroll(params: {
  scrollEl: Ref<HTMLElement | null>
  firstWeekIndex: Ref<number | null>
  onFocusDateChange: (date: ISODate) => void
  onReachEdge: (direction: "past" | "future") => void
}) {
  const {scrollEl, firstWeekIndex} = params
  let rafId: number | null = null

  function scrollToDate(date: ISODate, behavior: ScrollBehavior = "smooth") {
    const el = scrollEl.value
    if (!el || firstWeekIndex.value === null) return

    const top = scrollTopForDate({date, firstWeekIndex: firstWeekIndex.value, clientHeight: el.clientHeight})
    if (typeof el.scrollTo === "function") el.scrollTo({top, behavior})
    else el.scrollTop = top
  }

  function onScroll() {
    if (rafId !== null) return

    rafId = requestAnimationFrame(() => {
      rafId = null
      const el = scrollEl.value
      if (!el || firstWeekIndex.value === null) return

      params.onFocusDateChange(dateAtViewportCenter({scrollTop: el.scrollTop, clientHeight: el.clientHeight, firstWeekIndex: firstWeekIndex.value}))

      if (el.scrollTop < EDGE_THRESHOLD_PX) {
        params.onReachEdge("past")
      } else if (el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_THRESHOLD_PX) {
        params.onReachEdge("future")
      }
    })
  }

  // Week-index changes in either direction are compensated (flush: "post" = after
  // the DOM patch, before paint) so the same dates stay under the viewport.
  watch(
    firstWeekIndex,
    (next, prev) => {
      const el = scrollEl.value
      if (!el || next === null || prev === null || prev === undefined) return
      if (next !== prev) el.scrollTop += (prev - next) * ROW_HEIGHT
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

- [ ] **Step 2: Wire it into `CalendarSidebar.vue`**

Script additions (merge imports into existing lines):

```ts
import {computed, nextTick, onMounted, ref, watch} from "vue"

import {useCalendarScroll} from "./useCalendarScroll"
```

Add near the module constants:

```ts
const RANGE_SETTLE_WINDOW_MS = 10_000
```

After the `weeks` computed:

```ts
const firstWeekIndex = computed(() => weeks.value[0]?.index ?? null)
let suppressFollow = false
let queuedScroll: {date: ISODate; queuedAt: number} | null = null

const {scrollToDate} = useCalendarScroll({
  scrollEl,
  firstWeekIndex,
  onFocusDateChange: (date) => (focusMonth.value = monthKey(date)),
  onReachEdge: (direction) => void tasksStore.extendRange(direction),
})

function queueScroll(date: ISODate, behavior: ScrollBehavior) {
  // Queue only when the target needs a range change to become reachable (no data
  // yet, or outside the loaded window — a recenter is coming); otherwise the
  // immediate scroll suffices and a lingering queue would later yank the viewport.
  const range = tasksStore.loadedRange
  queuedScroll = !range || date < range.from || date > range.to ? {date, queuedAt: Date.now()} : null
  scrollToDate(date, behavior)
}

function scrollToToday() {
  queueScroll(today.value, "smooth")
}

function scrollToMonth(offset: 1 | -1) {
  const target = DateTime.fromISO(`${focusMonth.value}-01`).plus({months: offset}).toISODate()!
  queueScroll(target, "smooth")
}

watch(
  () => tasksStore.activeDay,
  (date) => {
    if (suppressFollow) {
      suppressFollow = false
      return
    }
    queueScroll(date, "smooth")
  },
)

// Re-issue the queued scroll when the loaded range changes underneath it: initial
// data arrival (cold launch) and recenterRange after a far jump both land here.
// The freshness window keeps stale targets from hijacking unrelated later extends.
watch(
  () => tasksStore.loadedRange,
  async () => {
    if (!queuedScroll) return
    if (Date.now() - queuedScroll.queuedAt > RANGE_SETTLE_WINDOW_MS) {
      queuedScroll = null
      return
    }
    await nextTick()
    scrollToDate(queuedScroll.date, "auto")
    queuedScroll = null
  },
)

onMounted(async () => {
  await nextTick()
  queueScroll(today.value, "auto")
})
```

Change `onCellClick` so lattice-internal selection doesn't trigger the follow-scroll:

```ts
function onCellClick(date: ISODate) {
  if (date === tasksStore.activeDay) return
  suppressFollow = true
  tasksStore.setActiveDay(date)
}
```

- [ ] **Step 3: Extend the header with chevrons and the today button**

Replace the header inner block with:

```vue
<div class="ml-traffic-light flex min-w-0 flex-1 items-center gap-0.5" style="-webkit-app-region: no-drag">
        <BaseButton variant="ghost" icon="chevron-left" class="p-0.5" tooltip="Previous month" @click="scrollToMonth(-1)" />
        <h2 class="min-w-0 flex-1 truncate text-center text-sm font-semibold capitalize">{{ headerLabel }}</h2>
        <BaseButton variant="ghost" icon="chevron-right" class="p-0.5" tooltip="Next month" @click="scrollToMonth(1)" />
        <BaseButton variant="ghost" icon="today" icon-class="text-accent" class="p-0.5" tooltip="Today" @click="scrollToToday" />
        <BaseButton variant="ghost" icon="sidebar" class="p-0.5" tooltip="Hide calendar" @click="uiStore.toggleSidebarCollapsed()" />
      </div>
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck:render && pnpm lint && pnpm evitest run --project renderer`
Expected: PASS (component tests stay green — mount-time scroll is guarded for happy-dom)

- [ ] **Step 5: Commit**

```bash
git add "src/renderer/src/ui/views/Main/{fragments}/Sidebar"
git commit -m "feat: calendar sidebar scrolling with focus month and edge loading"
```

---

### Task 6: Layout integration

**Files:**

- Modify: `src/renderer/src/ui/views/Main/Main.vue`
- Modify: `src/renderer/src/ui/views/Main/{fragments}/Header.vue`
- Modify: `src/renderer/src/ui/views/Main/model/useContentSize.ts`

- [ ] **Step 1: Add the sidebar width to `useContentSize.ts`** (full new content)

```ts
// src/renderer/src/ui/views/Main/model/useContentSize.ts
import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {useUIStore} from "@/stores/ui.store"

export const SIDEBAR_WIDTH = 288

const FOOTER_HEIGHT = 40
const HEADER_HEIGHT = 62

export function useContentSize(contentId: string) {
  const uiStore = useUIStore()
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const sidebarWidth = computed(() => (uiStore.sidebarCollapsed ? 0 : SIDEBAR_WIDTH))
  const footerHeight = FOOTER_HEIGHT
  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight)
  const contentWidth = computed(() => width.value - sidebarWidth.value)

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight, footerHeight, sidebarWidth}
}
```

- [ ] **Step 2: Mount the sidebar in `Main.vue`**

Script: add imports and destructure `sidebarWidth`:

```ts
import CalendarSidebar from "./{fragments}/Sidebar"
```

```ts
const {contentHeight, contentWidth, footerHeight, sidebarWidth} = useContentSize("container")
```

Template: insert the sidebar as the first child of the app shell (before `<main>`), width-bound:

```vue
<CalendarSidebar v-if="sidebarWidth > 0" :active-day="tasksStore.activeDay" :style="{width: `${sidebarWidth}px`}" />
```

(`v-if` on width keeps mount/unmount semantics — each expand re-centers on today via the component's `onMounted`.)

- [ ] **Step 3: Add the reopen button to `Header.vue`**

The header's first block currently reads:

```vue
<div class="ml-traffic-light flex min-w-0 items-center gap-2">
      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>
```

Replace with (traffic-light margin only when the sidebar is hidden — when expanded, the window controls sit over the sidebar header):

```vue
<div class="flex min-w-0 items-center gap-2" :class="{'ml-traffic-light': uiStore.sidebarCollapsed}">
      <BaseButton
        v-if="uiStore.sidebarCollapsed"
        variant="ghost"
        icon="sidebar"
        tooltip="Show calendar"
        style="-webkit-app-region: no-drag"
        @click="uiStore.toggleSidebarCollapsed()"
      />
      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>
```

(`uiStore` is already imported in Header.vue.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck:render && pnpm lint && pnpm evitest run --project renderer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/views/Main/Main.vue "src/renderer/src/ui/views/Main/{fragments}/Header.vue" src/renderer/src/ui/views/Main/model/useContentSize.ts
git commit -m "feat: mount calendar sidebar with collapsible layout"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the full gate**

Run: `pnpm check:all`
Expected: lint, all three typechecks, circular-dependency check, full test suite PASS.

- [ ] **Step 2: Manual sweep** (`pnpm dev`)

1. Cold launch: sidebar expanded, centered on today, header label = current month, other months' days dimmed (gray text), traffic lights clear of the sidebar header content.
2. Scroll up/down: header label and dimming migrate as months pass the viewport center; deep scroll keeps loading (console `[TASKS] Extended range ...`) with no visible jump, both directions.
3. Header: chevrons move exactly one month; today button returns (also right after a deep scroll).
4. Click a day → its tasks open, sidebar doesn't move; click the already-selected day → nothing breaks.
5. Collapse (sidebar button) → sidebar hides, header gains the reopen button and traffic-light margin; reopen; restart the app — state persists (`sidebar.collapsed`).
6. Search jump to a far date while expanded → sidebar scrolls to it.
7. Drag a task onto a sidebar day (any month) and onto a week-strip day — ring highlight + task moves in both.
8. Resize the window: sidebar fixed width, content area adapts; footer unchanged at 40px.

- [ ] **Step 3: Commit any fixes as `fix:` commits; implementation is complete when the gate and sweep both pass.**
