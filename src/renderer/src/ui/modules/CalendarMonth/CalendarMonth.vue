<script setup lang="ts">
import {useTasksStore} from "@/stores/tasks.store"
import BaseCalendar from "@/ui/base/BaseCalendar"

import RecentActiveTasksPanel from "./{fragments}/RecentActiveTasks.vue"

const tasksStore = useTasksStore()
</script>

<template>
  <div class="flex h-full flex-col gap-2 px-2 py-2">
    <BaseCalendar
      mode="single"
      :days="tasksStore.days"
      :selected-date="tasksStore.activeDay"
      :initial-month="tasksStore.activeDay"
      size="md"
      @select-date="tasksStore.setActiveDay"
    />
    <RecentActiveTasksPanel />
  </div>
</template>
