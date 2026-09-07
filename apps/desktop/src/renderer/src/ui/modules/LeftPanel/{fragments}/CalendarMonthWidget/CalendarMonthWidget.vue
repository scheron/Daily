<script setup lang="ts">
import {useTasksStore} from "@/stores/tasks"
import BaseCalendar from "@/ui/base/BaseCalendar"

const tasksStore = useTasksStore()
</script>

<template>
  <div class="px-1 py-2">
    <BaseCalendar size="sm" :days="tasksStore.days" :selected-date="tasksStore.activeDay" @select-date="tasksStore.setActiveDay" />
  </div>
</template>
