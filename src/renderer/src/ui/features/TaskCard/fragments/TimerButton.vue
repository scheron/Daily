<script setup lang="ts">
import {computed} from "vue"
import {formatDuration} from "@/utils/date"

import type {Task} from "@/types/tasks"

import BaseIcon from "@/ui/base/BaseIcon"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{"open-timer": []}>()

const isEstimated = computed(() => props.task.estimatedTime > 0)

const timeDisplay = computed(() => (props.task.status === "active" ? props.task.estimatedTime : props.task.spentTime))
</script>

<template>
  <div
    v-if="isEstimated"
    class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-3 py-1 h-7 text-xs transition-colors duration-200"
    :class="[
      task.status === 'done'
        ? 'text-success bg-success/10 border-success/20 hover:bg-success/20'
        : 'text-accent border-accent/20 hover:border-accent/40 hover:bg-accent/20',
    ]"
    @click="emit('open-timer')"
  >
    <BaseIcon :name="task.status === 'done' ? 'check-check' : 'stopwatch'" class="size-4" />
    <span class="tracking-wide"> {{ formatDuration(timeDisplay) }} </span>
  </div>
</template>
