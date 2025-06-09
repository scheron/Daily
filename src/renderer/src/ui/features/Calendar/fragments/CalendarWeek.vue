<script setup lang="ts">
import {computed, ref} from "vue"
import {Day} from "@/types/tasks"
import {getWeekStartDate, isToday} from "@/utils/date"
import {DateTime} from "luxon"

import type {ISODate} from "@/types/date"

import CalendarWeekDay from "./CalendarWeekDay.vue"

const props = defineProps<{activeDay: ISODate; days: Day[]}>()
const emit = defineEmits<{"select-date": [date: ISODate]}>()

const viewDate = ref(getWeekStartDate(props.activeDay))

const week = computed(() => formatDaysToWeek(props.days, viewDate.value))

function formatDaysToWeek(days: Day[], currentDate: ISODate) {
  const date = DateTime.fromISO(currentDate)
  const day = date.weekday
  const adjustedDay = day === 0 ? 7 : day
  const diff = date.day - adjustedDay + 1

  const weekStart = DateTime.fromISO(currentDate).set({day: diff})
  const week = []

  for (let i = 0; i < 7; i++) {
    const currentDate = weekStart.set({day: weekStart.day + i})
    const day = days.find((day) => day.date === currentDate.toISODate())

    week.push({
      date: currentDate.toISODate()!,
      isCurrentMonth: currentDate.month === date.month,
      day: day ?? null,
    })
  }

  return week
}

function isActive(date: ISODate) {
  return Boolean(props.activeDay && date === props.activeDay)
}

function selectDay(date: ISODate) {
  emit("select-date", date)
}
</script>

<template>
  <CalendarWeekDay
    v-for="weekDay in week"
    :key="weekDay.date"
    :day="weekDay.day"
    :date="weekDay.date"
    :current-month="weekDay.isCurrentMonth"
    :selected="isActive(weekDay.date)"
    :today="isToday(weekDay.date)"
    @select-date="selectDay(weekDay.date)"
  />
</template>
