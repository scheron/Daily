<script setup lang="ts">
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"

import type {ISODate} from "@/types/date"

import CalendarMonth from "./fragments/CalendarMonth.vue"
import CalendarWeek from "./fragments/CalendarWeek.vue"

const tasksStore = useTasksStore()
const uiStore = useUIStore()

function selectDay(date: ISODate) {
  tasksStore.setActiveDay(date)
  uiStore.setIsCalendarOpen(false)
}
</script>

<template>
  <div>
    <CalendarWeek v-if="uiStore.isSidebarCollapsed" :active-day="tasksStore.activeDay" :days="tasksStore.days" @select-date="selectDay" />
    <CalendarMonth v-else :active-day="tasksStore.activeDay" :days="tasksStore.days" @select-date="selectDay" />
  </div>
</template>
