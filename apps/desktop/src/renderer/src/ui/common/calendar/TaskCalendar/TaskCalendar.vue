<script setup lang="ts">
import {computed, onBeforeMount, ref, watch} from "vue"
import {DateTime} from "luxon"

import {isToday} from "@daily/std"

import {useBoardDrop} from "@/composables/tasks/useBoardDrop"
import {useSettingValue} from "@/composables/useSettingValue"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {calcMonthStatistics} from "./utils/calcMonthStatistics"
import {formatDaysToMonth} from "./utils/formatDaysToMonth"
import {useMonthDragStep} from "./useMonthDragStep"

import type {Day, ISODate} from "@daily/protocol"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

const props = withDefaults(
  defineProps<{
    days: Day[]
    selectedDate?: ISODate | null
    allowClear?: boolean
  }>(),
  {
    selectedDate: null,
    allowClear: false,
  },
)

const emit = defineEmits<{
  "select-date": [date: ISODate]
  "clear-date": []
}>()

const currentMonth = ref<DateTime<boolean>>(DateTime.now())

const boardMode = useSettingValue("appearance.boardMode", "normal")

const countColumns = computed(() =>
  TASK_COLUMNS.filter((column) => boardMode.value === "agents" || !["ready_for_agent", "ready_to_merge"].includes(column.status)),
)
const calendarDays = computed(() => formatDaysToMonth(currentMonth.value, props.days))
const monthYearDisplay = computed(() => currentMonth.value.toFormat("MMMM yyyy", {locale: "en"}))
const currentMonthKey = computed(() => currentMonth.value.toFormat("yyyy-MM"))
const monthCounts = computed(() => {
  const counts = calcMonthStatistics(props.days).get(currentMonthKey.value) ?? {
    backlog: 0,
    ready_for_agent: 0,
    in_progress: 0,
    ready_to_merge: 0,
    done: 0,
    cancelled: 0,
  }
  if (boardMode.value === "normal")
    return {...counts, backlog: counts.backlog + counts.ready_for_agent, in_progress: counts.in_progress + counts.ready_to_merge}
  return counts
})

const {dropTargetDate} = useBoardDrop()

useMonthDragStep(currentMonth)

function previousMonth() {
  currentMonth.value = currentMonth.value.minus({months: 1})
}

function nextMonth() {
  currentMonth.value = currentMonth.value.plus({months: 1})
}

function jumpToCurrentMonth() {
  currentMonth.value = DateTime.now()
}

function selectDate(isoDate: ISODate) {
  emit("select-date", isoDate)
}

function getCountClasses(hasTasks: boolean, titleClass: string) {
  return cn("flex shrink-0 items-center gap-0.5 whitespace-nowrap", hasTasks ? titleClass : "text-base-content/50")
}

function getDateClasses(isoDate: ISODate, isCurrentMonth: boolean) {
  const isDropTarget = dropTargetDate.value === isoDate
  const isSelected = props.selectedDate === isoDate

  return cn(
    "relative aspect-square w-full shrink-0 rounded-lg select-none h-8 text-sm",
    isCurrentMonth ? "text-base-content" : "text-base-content/50",
    isDropTarget ? "ring-accent border-accent ring-1" : isSelected && "bg-accent/30 text-accent hover:bg-accent/40",
    isToday(isoDate) && !isDropTarget && "border-accent border-1",
  )
}

function getDotClasses(hasActiveTasks: boolean) {
  return cn("absolute top-0.5 right-0.5 size-2 rounded-full shadow-xs", hasActiveTasks ? "bg-warning" : "bg-success")
}

watch(
  () => props.selectedDate,
  (newDate) => {
    if (!newDate) return

    const newMonth = DateTime.fromISO(newDate)
    const shouldUpdateView = newMonth.year !== currentMonth.value.year || newMonth.month !== currentMonth.value.month

    if (shouldUpdateView) currentMonth.value = newMonth
  },
)

onBeforeMount(() => {
  currentMonth.value = props.selectedDate ? DateTime.fromISO(props.selectedDate) : DateTime.now()
})
</script>

<template>
  <div class="w-max min-w-[378px] flex-1 p-1">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex shrink-0 items-center">
        <BaseButton variant="ghost" icon="chevron-left" data-month-step="previous" @click="previousMonth" />
        <BaseButton variant="ghost" tooltip="Jump to current month" @click="jumpToCurrentMonth">
          {{ monthYearDisplay }}
        </BaseButton>
        <BaseButton variant="ghost" icon="chevron-right" data-month-step="next" @click="nextMonth" />
      </div>
      <div class="flex shrink-0 items-center gap-2 px-1 text-xs font-semibold">
        <span
          v-for="column in countColumns"
          :key="column.status"
          :aria-label="`${column.label}: ${monthCounts[column.status]}`"
          :title="column.label"
          :class="getCountClasses(monthCounts[column.status] > 0, column.titleClass)"
        >
          <BaseIcon :name="column.icon" class="size-3" />
          {{ monthCounts[column.status] }}
        </span>
      </div>
    </div>

    <ul class="grid grid-cols-7 gap-1">
      <li v-for="day in WEEKDAYS" :key="day" class="text-accent/70 w-full shrink-0 select-none py-2 text-center text-sm">{{ day }}</li>
    </ul>

    <div class="border-accent/10 my-1 border-b" />

    <ul class="grid grid-cols-7 gap-1">
      <BaseButton
        v-for="day in calendarDays"
        :key="day.isoDate"
        variant="ghost"
        :data-drop-day="day.isoDate"
        :class="getDateClasses(day.isoDate, day.isCurrentMonth)"
        @click="selectDate(day.isoDate)"
      >
        {{ day.date.day }}

        <div v-if="day.dayInfo.countTotalTasks" :class="getDotClasses(day.dayInfo.countActiveTasks > 0)" />
      </BaseButton>
    </ul>
    <BaseButton v-if="allowClear && selectedDate" variant="ghost-muted" icon="calendar" class="mt-2 w-full" @click="emit('clear-date')">
      Clear date
    </BaseButton>
  </div>
</template>
