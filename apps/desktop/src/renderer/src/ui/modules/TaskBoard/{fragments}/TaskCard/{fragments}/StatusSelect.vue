<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BasePopup from "@/ui/base/BasePopup.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@daily/protocol"

const STATUS_ACTIONS: Array<{label: string; value: TaskStatus; icon: IconName; tooltip: string}> = [
  {label: "Backlog", value: "backlog", icon: "bookmark", tooltip: "Move to backlog"},
  {label: "Active", value: "active", icon: "fire", tooltip: "Set as active"},
  {label: "Done", value: "done", icon: "check-check", tooltip: "Mark as done"},
  {label: "Discarded", value: "discarded", icon: "archive", tooltip: "Discard task"},
]

const props = withDefaults(defineProps<{status: TaskStatus}>(), {status: "active"})
const emit = defineEmits<{"update:status": [status: TaskStatus]}>()

const currentStatusAction = computed(() => STATUS_ACTIONS.find(({value}) => value === props.status) ?? STATUS_ACTIONS[0])

const showRing = computed(() => props.status === "done" || props.status === "discarded")

function onSelectStatus(status: TaskStatus, hide?: () => void) {
  emit("update:status", status)
  hide?.()
}

function getTriggerClasses(status: TaskStatus) {
  return cn(
    "size-7 p-0",
    status === "active" && "text-error hover:bg-error/10",
    status === "discarded" && "text-warning hover:bg-warning/10",
    status === "done" && "text-success hover:bg-success/10",
  )
}

function getActionClasses(status: TaskStatus) {
  return cn(
    "w-full justify-start px-2 py-1 text-xs",
    props.status !== status && "text-base-content/70 hover:bg-base-200 hover:text-base-content",
    props.status === status && status === "active" && "text-error bg-error/10 hover:bg-error/20",
    props.status === status && status === "discarded" && "text-warning bg-warning/10 hover:bg-warning/20",
    props.status === status && status === "done" && "text-success bg-success/10 hover:bg-success/20",
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
  <BasePopup hide-header container-class="min-w-32 p-1" position="end" content-class="gap-1">
    <template #trigger="{toggle}">
      <div class="relative inline-block">
        <BaseButton
          variant="ghost"
          :class="getTriggerClasses(currentStatusAction.value)"
          :icon="currentStatusAction.icon"
          :tooltip="currentStatusAction.tooltip"
          icon-class="size-4"
          @click="toggle"
        />
        <div v-if="showRing" aria-hidden="true" :class="getRingClasses(status)" />
      </div>
    </template>

    <template #default="{hide}">
      <BaseButton
        v-for="status in STATUS_ACTIONS"
        :key="status.value"
        variant="ghost"
        :class="getActionClasses(status.value)"
        :icon="status.icon"
        icon-class="size-4"
        :tooltip="status.tooltip"
        @click="onSelectStatus(status.value, hide)"
      >
        <span class="tracking-wide uppercase">{{ status.label }}</span>
      </BaseButton>
    </template>
  </BasePopup>
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
