<script setup lang="ts">
import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {toTaskTitle} from "@/utils/tasks/toTaskTitle"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task, TaskRelationSets, TaskStatus} from "@daily/protocol"

defineProps<{task: Task; side: keyof TaskRelationSets}>()
const emit = defineEmits<{open: []; remove: []}>()

function columnFor(status: TaskStatus) {
  return TASK_COLUMNS.find((column) => column.status === status)!
}

function isResolved(status: TaskStatus) {
  return status === "done" || status === "discarded"
}

function getRowClasses(side: keyof TaskRelationSets) {
  return cn(
    "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
    side === "blockedBy" ? "bg-warning/15 hover:bg-warning/25" : "bg-info/15 hover:bg-info/25",
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
  <div :class="getRowClasses(side)" @click="emit('open')">
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
