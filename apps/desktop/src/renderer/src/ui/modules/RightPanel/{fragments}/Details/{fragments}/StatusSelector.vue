<script setup lang="ts">
import {TASK_COLUMNS} from "@/constants/ui"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()

function selectStatus(status: TaskStatus) {
  if (status !== props.task.status) taskEditorStore.patch({status})
}

function getOptionClasses(isActive: boolean, titleClass: string, counterClass: string) {
  return cn(
    "focus-visible-accent flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors",
    isActive ? counterClass : cn(titleClass, "hover:bg-base-content/5"),
  )
}
</script>

<template>
  <div class="flex items-stretch gap-1">
    <button
      v-for="option in TASK_COLUMNS"
      :key="option.status"
      type="button"
      :class="getOptionClasses(option.status === task.status, option.titleClass, option.counterClass)"
      @click="selectStatus(option.status)"
    >
      <BaseIcon :name="option.icon" class="size-4 shrink-0" />
      <span class="truncate">{{ option.label }}</span>
    </button>
  </div>
</template>
