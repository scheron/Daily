<script setup lang="ts">
import {computed, onBeforeMount, ref, watch} from "vue"
import {DateTime} from "luxon"

import {isToday} from "@/utils/date"
import BaseButton from "@/ui/base/BaseButton.vue"
import {WEEKDAYS} from "./model/constants"
import {formatDaysToMonth} from "./model/helpers"

import type {ISODate} from "@/types/date"
import type {Day} from "@/types/tasks"
import type {CalendarMode, CalendarSize, DateRange} from "./model/types"

const props = withDefaults(
  defineProps<{
    mode?: CalendarMode
    days: Day[]
    selectedDate?: ISODate | null
    selectedRange?: DateRange | null
    initialMonth?: ISODate
    size?: CalendarSize
  }>(),
  {
    mode: "single",
    selectedDate: null,
    selectedRange: null,
    size: "md",
  },
)

const emit = defineEmits<{
  "select-date": [date: ISODate]
  "update-range": [range: DateRange]
}>()

const currentMonth = ref<DateTime<boolean>>(DateTime.now())

const calendarDays = computed(() => formatDaysToMonth(currentMonth.value, props.days))
const monthYearDisplay = computed(() => currentMonth.value.toFormat("MMMM yyyy", {locale: "en"}))

const sizeConfig = computed(() => {
  const configs = {
    sm: {
      buttonSize: "md" as const,
      buttonHeight: "h-8",
      textSize: "text-sm",
      headerTextSize: "text-sm",
      weekdayTextSize: "text-sm",
    },
    md: {
      buttonSize: "md" as const,
      buttonHeight: "h-9",
      textSize: "text-sm",
      headerTextSize: "text-lg",
      weekdayTextSize: "text-sm",
    },
    lg: {
      buttonSize: "sm" as const,
      buttonHeight: "h-14",
      textSize: "text-base",
      headerTextSize: "text-lg",
      weekdayTextSize: "text-base",
    },
  }
  return configs[props.size]
})

function previousMonth() {
  currentMonth.value = currentMonth.value.minus({months: 1})
}

function nextMonth() {
  currentMonth.value = currentMonth.value.plus({months: 1})
}

function selectDate(isoDate: ISODate) {
  if (props.mode === "single") emit("select-date", isoDate)
  else handleRangeSelection(isoDate)
}

function handleRangeSelection(isoDate: ISODate) {
  const clickedDate = DateTime.fromISO(isoDate)
  const currentRange = props.selectedRange || {start: null, end: null}

  if (!currentRange.start || currentRange.end) {
    emit("update-range", {start: isoDate, end: null})
  } else {
    const startDate = DateTime.fromISO(currentRange.start)
    const newRange = clickedDate < startDate ? {start: isoDate, end: currentRange.start} : {start: currentRange.start, end: isoDate}

    emit("update-range", newRange)
  }
}

function isDateSelected(isoDate: ISODate) {
  if (props.mode === "single") {
    return props.selectedDate === isoDate
  } else {
    const range = props.selectedRange
    return Boolean(range && (range.start === isoDate || range.end === isoDate))
  }
}

function isDateInRange(isoDate: ISODate) {
  if (props.mode !== "range") return false

  const range = props.selectedRange
  if (!range?.start || !range?.end) return false

  const date = DateTime.fromISO(isoDate)
  const start = DateTime.fromISO(range.start)
  const end = DateTime.fromISO(range.end)

  return date >= start && date <= end
}

function getDateClasses(day: ReturnType<typeof formatDaysToMonth>[0]) {
  const classes = [day.isCurrentMonth ? "text-base-content" : "text-base-content/50"]

  if (props.mode === "single") {
    if (isToday(day.isoDate)) classes.push("border-accent border-1")
    if (isDateSelected(day.isoDate)) classes.push("bg-accent/30 text-accent hover:bg-accent/40")
  } else {
    if (isDateSelected(day.isoDate)) classes.push("bg-accent/30 text-accent hover:bg-accent/40")
    else if (isDateInRange(day.isoDate)) classes.push("bg-accent/20 hover:bg-accent/30")
  }

  return classes
}

watch(
  () => props.selectedDate,
  (newDate) => {
    if (!newDate || props.mode !== "single") return

    const newMonth = DateTime.fromISO(newDate)
    const shouldUpdateView = newMonth.year !== currentMonth.value.year || newMonth.month !== currentMonth.value.month

    if (shouldUpdateView) currentMonth.value = newMonth
  },
)

onBeforeMount(() => {
  currentMonth.value = props.initialMonth
    ? DateTime.fromISO(props.initialMonth)
    : props.selectedDate
      ? DateTime.fromISO(props.selectedDate)
      : DateTime.now()
})
</script>

<template>
  <div class="flex-1">
    <div class="mb-4 flex items-center justify-between">
      <BaseButton variant="ghost" icon="chevron-left" @click="previousMonth" />
      <h2 class="font-semibold capitalize" :class="sizeConfig.headerTextSize">
        {{ monthYearDisplay }}
      </h2>
      <BaseButton variant="ghost" icon="chevron-right" @click="nextMonth" />
    </div>

    <ul class="grid grid-cols-7 gap-1">
      <li v-for="day in WEEKDAYS" :key="day" class="text-accent/70 w-full shrink-0 py-2 text-center select-none" :class="sizeConfig.weekdayTextSize">
        {{ day }}
      </li>
    </ul>

    <div class="border-accent/10 my-1 border-b" />

    <ul class="grid grid-cols-7 gap-1">
      <BaseButton
        v-for="day in calendarDays"
        :key="day.isoDate"
        variant="ghost"
        :size="sizeConfig.buttonSize"
        class="relative aspect-square w-full shrink-0 select-none"
        :class="[sizeConfig.buttonHeight, sizeConfig.textSize, ...getDateClasses(day)]"
        @click="selectDate(day.isoDate)"
      >
        {{ day.date.day }}

        <div
          v-if="day.dayInfo.countTotalTasks"
          class="absolute right-0.5 top-0.5 size-2 rounded-full shadow-xs"
          :class="[day.dayInfo.countActiveTasks === 0 ? 'bg-success' : 'bg-warning']"
        />
      </BaseButton>
    </ul>
  </div>
</template>
