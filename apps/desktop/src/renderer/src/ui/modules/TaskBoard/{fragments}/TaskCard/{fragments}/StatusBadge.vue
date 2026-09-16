<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@daily/protocol"

const props = defineProps<{status: TaskStatus}>()

const icon = computed(
  () => (({backlog: "bookmark", active: "fire", done: "check-check", discarded: "archive"}) satisfies Record<TaskStatus, IconName>)[props.status],
)
const label = computed(() => ({backlog: "Backlog", active: "Active", done: "Done", discarded: "Discarded"})[props.status])
const showRing = computed(() => props.status === "done" || props.status === "discarded")

function getBadgeClasses(status: TaskStatus) {
  return cn(
    "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full",
    status === "active" && "text-error",
    status === "discarded" && "text-warning",
    status === "done" && "text-success",
    status === "backlog" && "text-base-content/60",
  )
}

function getRingClasses(status: TaskStatus) {
  return cn(
    "status-ring pointer-events-none absolute inset-0 rounded-full border border-dashed",
    status === "done" && "border-success/60",
    status === "discarded" && "border-warning/60",
  )
}
</script>

<template>
  <span v-tooltip="label" :class="getBadgeClasses(status)">
    <BaseIcon :name="icon" class="size-4" />
    <span v-if="showRing" aria-hidden="true" :class="getRingClasses(status)" />
  </span>
</template>

<style scoped>
.status-ring {
  animation: status-ring-spin 16s linear infinite;
}

@keyframes status-ring-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
