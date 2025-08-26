<script setup lang="ts">
import {computed} from "vue"
import {useTasksStore} from "@/stores/tasks.store"
import {getWeekDays, isToday} from "@/utils/date"

import type {ISODate} from "@/types/date"

import WeekDay from "./fragments/WeekDay.vue"

const tasksStore = useTasksStore()

const week = computed(() => getWeekDays(tasksStore.days, tasksStore.activeDay))

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
