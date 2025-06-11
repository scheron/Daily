<script setup lang="ts">
import {computed, ref} from "vue"
import {DateTime} from "luxon"

import {getWeekStartDate, isToday} from "@/utils/date"
import {useTasksStore} from "@/stores/tasks.store"
import WeekDay from "./fragments/WeekDay.vue"

import type {ISODate} from "@/types/date"
import type {Day} from "@/types/tasks"

const tasksStore = useTasksStore()

const viewDate = ref(getWeekStartDate(tasksStore.activeDay))

const week = computed(() => formatDaysToWeek(tasksStore.days, viewDate.value))

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
  return Boolean(tasksStore.activeDay && date === tasksStore.activeDay)
}
</script>

<template>
  <WeekDay
    v-for="weekDay in week"
    :key="weekDay.date"
    :day="weekDay.day"
    :date="weekDay.date"
    :current-month="weekDay.isCurrentMonth"
    :selected="isActive(weekDay.date)"
    :today="isToday(weekDay.date)"
    @select-date="tasksStore.setActiveDay(weekDay.date)"
  />
</template>
