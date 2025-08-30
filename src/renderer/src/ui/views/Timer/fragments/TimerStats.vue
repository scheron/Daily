<script setup lang="ts">
import {computed} from "vue"
import {Task} from "@/types/tasks"
import {formatDuration} from "@/utils/date"

const props = defineProps<{task: Task}>()

const formattedEstimatedTime = computed(() => formatDuration(props.task.estimatedTime))
const formattedSpentTime = computed(() => formatDuration(props.task.spentTime))
</script>

<template>
  <main class="flex size-full flex-1 flex-col items-center justify-center gap-3">
    <div class="w-full px-8 text-center">
      <h1 class="text-base-content mb-2 text-center text-lg font-bold">Task stats</h1>

      <div class="flex w-full flex-col gap-2">
        <div class="bg-base-200/50 text-accent flex items-center justify-between gap-1 rounded-lg p-2">
          <div class="text-xs font-semibold tracking-wide uppercase">Estimated</div>
          <div class="text-base font-bold">{{ formattedEstimatedTime }}</div>
        </div>
        <div
          class="bg-base-200/50 flex items-center justify-between gap-1 rounded-lg p-2"
          :class="{
            'text-warning': task.status === 'discarded',
            'text-success': task.status === 'done',
          }"
        >
          <div class="text-xs font-semibold tracking-wide uppercase">Actual</div>
          <div class="text-base font-bold">{{ formattedSpentTime }}</div>
        </div>
      </div>
    </div>
  </main>
</template>
