<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue"
import {useElementSize, useNow} from "@vueuse/core"
import {DateTime} from "luxon"

import {toMonthYear} from "@shared/utils/date/formatters"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {dropTargetDate} from "@/composables/useDayDropTarget"
import BaseButton from "@/ui/base/BaseButton.vue"
import {WEEKDAYS} from "@/ui/base/BaseCalendar/constants"

import {useCalendarScroll} from "./useCalendarScroll"
import {buildWeekRange, dayOfMonth, getDayDotStatus, monthKey} from "./weekLattice"

import type {ISODate} from "@shared/types/common"
import type {WeekRow} from "./weekLattice"

const RANGE_SETTLE_WINDOW_MS = 10_000

const props = defineProps<{activeDay: ISODate}>()

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const now = useNow()

const scrollEl = ref<HTMLElement | null>(null)
const today = computed(() => DateTime.fromJSDate(now.value).toISODate()!)
const focusMonth = ref(monthKey(DateTime.now().toISODate()!))

const headerLabel = computed(() => toMonthYear(`${focusMonth.value}-01`))

const dotByDate = computed(() => {
  const map = new Map<ISODate, string>()
  for (const day of tasksStore.days) {
    const dot = getDayDotStatus(day)
    if (dot) map.set(day.date, dot === "active" ? "bg-warning" : "bg-success")
  }
  return map
})

const weeks = computed<WeekRow[]>(() => {
  const range = tasksStore.loadedRange
  if (!range) return []
  return buildWeekRange(range.from, range.to)
})

const firstWeekIndex = computed(() => weeks.value[0]?.index ?? null)
let suppressFollow = false
let queuedScroll: {date: ISODate; queuedAt: number} | null = null

const {scrollToDate, refresh} = useCalendarScroll({
  scrollEl,
  firstWeekIndex,
  onFocusDateChange: (date) => (focusMonth.value = monthKey(date)),
  onReachEdge: (direction) => void tasksStore.extendRange(direction),
})

// The window can resize after mount (size restore, maximize), invalidating the
// mount-time centering. Until the user touches the calendar, re-center on today
// whenever the viewport height settles; afterwards only refresh the focus month.
const {height: viewportHeight} = useElementSize(scrollEl)
let userInteracted = false

function markUserInteracted() {
  userInteracted = true
}

watch(viewportHeight, async (height) => {
  if (height <= 0) return
  await nextTick()
  if (userInteracted) refresh()
  else scrollToDate(today.value, "auto")
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
  scrollEl.value?.addEventListener("wheel", markUserInteracted, {passive: true, once: true})
  scrollEl.value?.addEventListener("pointerdown", markUserInteracted, {passive: true, once: true})
  await nextTick()
  queueScroll(today.value, "auto")
})

function onCellClick(date: ISODate) {
  if (date === tasksStore.activeDay) return
  suppressFollow = true
  tasksStore.setActiveDay(date)
}

function isFocusMonth(date: ISODate): boolean {
  return monthKey(date) === focusMonth.value
}

function cellClass(date: ISODate): string[] {
  const classes = [isFocusMonth(date) ? "text-base-content" : "text-base-content/50"]

  // Stepped month boundary: each column has exactly one cell with day-of-month ≤ 7,
  // so a top border on those cells traces the month's starting edge.
  if (dayOfMonth(date) <= 7) classes.push("border-t", "border-t-base-300")

  if (dropTargetDate.value === date) classes.push("ring-accent border-accent ring-1")
  else if (date === props.activeDay) classes.push("bg-accent/30 text-accent hover:bg-accent/40")

  if (date === today.value) classes.push("border-accent border-1")

  return classes
}
</script>

<template>
  <aside class="app-sidebar border-base-300 bg-base-100 flex h-full shrink-0 flex-col border-r">
    <div class="border-base-300 h-header flex shrink-0 items-center border-b px-2" style="-webkit-app-region: drag">
      <div class="ml-traffic-light flex min-w-0 flex-1 items-center gap-0.5" style="-webkit-app-region: no-drag">
        <BaseButton variant="ghost" icon="chevron-left" class="p-0.5" tooltip="Previous month" @click="scrollToMonth(-1)" />
        <h2 class="min-w-0 flex-1 truncate text-center text-sm font-semibold capitalize">{{ headerLabel }}</h2>
        <BaseButton variant="ghost" icon="chevron-right" class="p-0.5" tooltip="Next month" @click="scrollToMonth(1)" />
        <BaseButton variant="ghost" icon="today" icon-class="text-accent" class="p-0.5" tooltip="Today" @click="scrollToToday" />
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
            type="button"
            :data-drop-day="date"
            :aria-label="date"
            :aria-current="date === today ? 'date' : undefined"
            class="relative h-9 w-full shrink-0 text-sm select-none"
            :class="cellClass(date)"
            @click="onCellClick(date)"
          >
            {{ dayOfMonth(date) }}

            <div v-if="dotByDate.get(date)" class="absolute top-0.5 right-0.5 size-2 rounded-full shadow-xs" :class="dotByDate.get(date)" />
          </BaseButton>
        </template>
      </div>
    </div>
  </aside>
</template>
