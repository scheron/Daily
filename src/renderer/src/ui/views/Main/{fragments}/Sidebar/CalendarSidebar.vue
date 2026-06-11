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
import type {WeekRow} from "./weekLattice"

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

function onCellClick(date: ISODate) {
  if (date === tasksStore.activeDay) return
  tasksStore.setActiveDay(date)
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
