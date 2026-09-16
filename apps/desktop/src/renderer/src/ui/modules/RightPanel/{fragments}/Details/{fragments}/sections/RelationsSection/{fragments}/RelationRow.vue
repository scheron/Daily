<script setup lang="ts">
import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {toTaskTitle} from "@/utils/tasks/toTaskTitle"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task, TaskStatus} from "@daily/protocol"

defineProps<{task: Task}>()
const emit = defineEmits<{open: []; remove: []}>()

function columnFor(status: TaskStatus) {
  return TASK_COLUMNS.find((column) => column.status === status)!
}

function isResolved(status: TaskStatus) {
  return status === "done" || status === "discarded"
}

function getRowClasses(status: TaskStatus) {
  return cn(
    "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
    status === "backlog" && "bg-base-content/5 hover:bg-base-content/10",
    status === "active" && "bg-error/10 hover:bg-error/20",
    status === "done" && "bg-success/10 hover:bg-success/20",
    status === "discarded" && "bg-warning/10 hover:bg-warning/20",
  )
}

function getIconClasses(status: TaskStatus) {
  return cn("size-3.5 shrink-0", columnFor(status).titleClass)
}

function getTitleClasses(status: TaskStatus) {
  return cn("min-w-0 flex-1 truncate", isResolved(status) && "text-base-content/50")
}
</script>

<template>
  <div :class="getRowClasses(task.status)" @click="emit('open')">
    <BaseIcon :name="columnFor(task.status).icon" :class="getIconClasses(task.status)" />
    <span :class="getTitleClasses(task.status)">{{ toTaskTitle(task.content) }}</span>
    <BaseButton
      variant="ghost"
      icon="x"
      icon-class="size-3.5"
      class="size-5 p-0 opacity-0 group-hover:opacity-100"
      tooltip="Remove link"
      @click.stop="emit('remove')"
    />
  </div>
</template>
