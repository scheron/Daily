<script setup lang="ts">
import {computed, onBeforeMount, ref, watch} from "vue"
import {DateTime} from "luxon"

import {boardColumnForStatus} from "@daily/protocol"
import {isToday, toDateLabel} from "@daily/std"

import {useBoardDrop} from "@/composables/tasks/useBoardDrop"
import {useSettingValue} from "@/composables/useSettingValue"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import {cn} from "@/utils/ui/tailwindcss"
import {useMonthDragStep} from "./composables/useMonthDragStep"
import {countTasksByStatus} from "./utils/countTasksByStatus"
import {formatDaysToMonth} from "./utils/formatDaysToMonth"
import StatusCounts from "./{fragments}/StatusCounts.vue"

import type {BoardMode, Day, ISODate} from "@daily/protocol"

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

const boardMode = useSettingValue<"appearance.boardMode", BoardMode>("appearance.boardMode", "normal")

const countColumns = computed(() => TASK_COLUMNS.filter(({status}) => boardColumnForStatus(status, boardMode.value) === status))
const calendarDays = computed(() => formatDaysToMonth(currentMonth.value, props.days))
const monthYearDisplay = computed(() => currentMonth.value.toFormat("MMMM yyyy", {locale: "en"}))
const currentMonthKey = computed(() => currentMonth.value.toFormat("yyyy-MM"))
const monthCounts = computed(() =>
  countTasksByStatus(
    props.days.filter((day) => day.date.slice(0, 7) === currentMonthKey.value).flatMap((day) => day.tasks),
    boardMode.value,
  ),
)

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

function getDateClasses(isoDate: ISODate, isCurrentMonth: boolean) {
  const isDropTarget = dropTargetDate.value === isoDate
  const isSelected = props.selectedDate === isoDate

  return cn(
    "relative aspect-square w-full shrink-0 rounded-lg select-none h-8 text-sm",
    [isCurrentMonth ? "text-base-content" : "text-base-content/50"],
    {"ring-accent border-accent ring-1": isDropTarget, "bg-accent/30 text-accent hover:bg-accent/40": !isDropTarget && isSelected},
    {"border-accent border-1": isToday(isoDate) && !isDropTarget},
  )
}

function getDotClasses(hasActiveTasks: boolean) {
  return cn("absolute top-0.5 right-0.5 size-2 rounded-full shadow-xs", [hasActiveTasks ? "bg-warning" : "bg-success"])
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
      <StatusCounts :columns="countColumns" :counts="monthCounts" class="px-1" show-labels />
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
        :tooltip-delay-ms="300"
        :aria-label="toDateLabel(day.isoDate)"
        :data-drop-day="day.isoDate"
        :class="getDateClasses(day.isoDate, day.isCurrentMonth)"
        @click="selectDate(day.isoDate)"
      >
        {{ day.date.day }}

        <div v-if="day.dayInfo.countTotalTasks" :class="getDotClasses(day.dayInfo.countActiveTasks > 0)" />

        <template #tooltip>
          <StatusCounts :columns="countColumns" :counts="countTasksByStatus(day.tasks, boardMode)" />
        </template>
      </BaseButton>
    </ul>
    <BaseButton v-if="allowClear && selectedDate" variant="ghost-muted" icon="calendar" class="mt-2 w-full" @click="emit('clear-date')">
      Clear date
    </BaseButton>
  </div>
</template>
