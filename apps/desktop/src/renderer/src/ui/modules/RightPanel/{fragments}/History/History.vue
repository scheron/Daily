<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {useTaskHistory} from "./composables/useTaskHistory"
import TaskHistoryTimeline from "./{fragments}/TaskHistoryTimeline.vue"

const {events, isEmpty} = useTaskHistory()
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div v-if="isEmpty" class="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <BaseIcon name="history" class="text-base-content/15 size-7" />
      <span class="text-base-content/50 text-sm">No history yet</span>
    </div>

    <TaskHistoryTimeline v-else :events="events" />
  </div>
</template>
