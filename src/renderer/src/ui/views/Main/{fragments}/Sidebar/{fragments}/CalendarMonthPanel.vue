<script setup lang="ts">
import {useTasksStore} from "@/stores/tasks.store"
import BaseCalendar from "@/ui/base/BaseCalendar"

const tasksStore = useTasksStore()
</script>

<template>
  <BaseCalendar
    mode="single"
    :days="tasksStore.days"
    :selected-date="tasksStore.activeDay"
    :initial-month="tasksStore.activeDay"
    size="md"
    @select-date="tasksStore.setActiveDay"
  />
</template>
