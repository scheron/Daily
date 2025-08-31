<script setup lang="ts">
import {computed} from "vue"
import {formatDuration} from "@/utils/date"

import type {Task} from "@/types/tasks"

import BaseIcon from "@/ui/base/BaseIcon"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{"open-timer": []}>()

const isEstimated = computed(() => props.task.estimatedTime > 0)
</script>

<template>
  <div
    v-if="isEstimated"
    v-tooltip="{content: task.status === 'active' ? 'Open task timer' : 'Check task statistics', placement: 'bottom-end'}"
    class="flex h-7 shrink-0 items-center gap-1 rounded-md border px-3 py-1 text-xs transition-colors duration-200"
    :class="{
      'text-accent border-accent/20 hover:border-accent/40 hover:bg-accent/20': task.status === 'active',
      'text-success bg-success/10 border-success/20 hover:bg-success/20': task.status === 'done',
      'text-warning bg-warning/10 border-warning/20 hover:bg-warning/20': task.status === 'discarded',
    }"
    @click="emit('open-timer')"
  >
    <BaseIcon :name="task.status === 'active' ? 'stopwatch' : 'check-check'" class="size-4" />
    <span class="tracking-wide">
      {{ task.status === "active" ? formatDuration(props.task.estimatedTime) : formatDuration(props.task.spentTime) }}
    </span>
  </div>
</template>
