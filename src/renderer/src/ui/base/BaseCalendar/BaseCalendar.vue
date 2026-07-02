<script setup lang="ts">
import {computed, onBeforeMount, ref, watch} from "vue"
import {DateTime} from "luxon"

import {isInRange, isToday} from "@shared/utils/date/validators"
import {calcMonthStatistics} from "@/utils/days/calcMonthStatistics"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

import {useCalendarSwipe} from "./composables/useCalendarSwipe"
import {useDropToDay} from "./composables/useDropToDay"
import {formatDaysToMonth} from "./utils/formatDaysToMonth"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

type DateRange = {start: ISODate | null; end: ISODate | null}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

const props = withDefaults(
  defineProps<{
    mode?: "single" | "range"
    days: Day[]
    selectedDate?: ISODate | null
    selectedRange?: DateRange | null
    initialMonth?: ISODate
    size?: "sm" | "md" | "lg"
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
const calendarRootRef = ref<HTMLElement | null>(null)

const calendarDays = computed(() => formatDaysToMonth(currentMonth.value, props.days))
const monthYearDisplay = computed(() => currentMonth.value.toFormat("MMMM yyyy", {locale: "en"}))
const currentMonthKey = computed(() => currentMonth.value.toFormat("yyyy-MM"))

const monthCounts = computed(() => calcMonthStatistics(props.days).get(currentMonthKey.value) ?? {active: 0, discarded: 0, done: 0})

const sizeConfig = computed(() => {
  const configs = {
    sm: {
      buttonSize: "md" as const,
      buttonHeight: "h-8",
      textSize: "text-sm",
      headerTextSize: "text-sm",
      weekdayTextSize: "text-sm",
      statsIconSize: "size-3",
      statsTextSize: "text-xs",
    },
    md: {
      buttonSize: "md" as const,
      buttonHeight: "h-9",
      textSize: "text-sm",
      headerTextSize: "text-base",
      weekdayTextSize: "text-sm",
      statsIconSize: "size-3.5",
      statsTextSize: "text-xs",
    },
    lg: {
      buttonSize: "sm" as const,
      buttonHeight: "h-14",
      textSize: "text-base",
      headerTextSize: "text-lg",
      weekdayTextSize: "text-base",
      statsIconSize: "size-4",
      statsTextSize: "text-sm",
    },
  }
  return configs[props.size]
})

const {dropTargetDate} = useDropToDay()

useCalendarSwipe({
  target: calendarRootRef,
  onPreviousMonth: previousMonth,
  onNextMonth: nextMonth,
})

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
  if (props.mode === "single") emit("select-date", isoDate)
  else selectRange(isoDate)
}

function selectRange(isoDate: ISODate) {
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

  return isInRange(isoDate, range.start, range.end)
}

function getDateClasses(day: ReturnType<typeof formatDaysToMonth>[0]) {
  const classes = [day.isCurrentMonth ? "text-base-content" : "text-base-content/50"]

  if (dropTargetDate.value === day.isoDate) {
    classes.push("ring-accent border-accent ring-1")
  } else if (props.mode === "single") {
    if (isDateSelected(day.isoDate)) classes.push("bg-accent/30 text-accent hover:bg-accent/40")
  } else {
    if (isDateSelected(day.isoDate)) classes.push("bg-accent/30 text-accent hover:bg-accent/40")
    else if (isDateInRange(day.isoDate)) classes.push("bg-accent/20 hover:bg-accent/30")
  }

  if (isToday(day.isoDate) && dropTargetDate.value !== day.isoDate) {
    classes.push("border-accent border-1")
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
  <div ref="calendarRootEl" class="flex-1 p-1">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex shrink-0 items-center">
        <BaseButton variant="ghost" size="sm" icon="chevron-left" @click="previousMonth" />
        <BaseButton variant="ghost" size="sm" tooltip="Jump to current month" :class="sizeConfig.headerTextSize" @click="jumpToCurrentMonth">
          {{ monthYearDisplay }}
        </BaseButton>
        <BaseButton variant="ghost" size="sm" icon="chevron-right" @click="nextMonth" />
      </div>

      <div class="flex shrink-0 items-center gap-1.5 px-3 font-semibold" :class="sizeConfig.statsTextSize">
        <span class="flex items-center gap-0.5" :class="[monthCounts.active > 0 ? 'text-error' : 'text-base-content/50']">
          <BaseIcon name="fire" :class="sizeConfig.statsIconSize" />
          {{ monthCounts.active }}
        </span>
        <span class="flex items-center gap-0.5" :class="[monthCounts.discarded > 0 ? 'text-warning' : 'text-base-content/50']">
          <BaseIcon name="archive" :class="sizeConfig.statsIconSize" />
          {{ monthCounts.discarded }}
        </span>
        <span class="flex items-center gap-0.5" :class="[monthCounts.done > 0 ? 'text-success' : 'text-base-content/50']">
          <BaseIcon name="check-check" :class="sizeConfig.statsIconSize" />
          {{ monthCounts.done }}
        </span>
      </div>
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
        :data-drop-day="day.isoDate"
        class="relative aspect-square w-full shrink-0 rounded-lg select-none"
        :class="[sizeConfig.buttonHeight, sizeConfig.textSize, ...getDateClasses(day)]"
        @click="selectDate(day.isoDate)"
      >
        {{ day.date.day }}

        <div
          v-if="day.dayInfo.countTotalTasks"
          class="absolute top-0.5 right-0.5 size-2 rounded-full shadow-xs"
          :class="[day.dayInfo.countActiveTasks === 0 ? 'bg-success' : 'bg-warning']"
        />
      </BaseButton>
    </ul>
  </div>
</template>
