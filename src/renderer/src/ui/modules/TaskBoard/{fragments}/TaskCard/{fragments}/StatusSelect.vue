<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BasePopup from "@/ui/base/BasePopup.vue"

import {STATUS_ACTIONS} from "../model/constants"

import type {TaskStatus} from "@shared/types/storage"

const props = withDefaults(defineProps<{status: TaskStatus}>(), {status: "active"})
const emit = defineEmits<{"update:status": [status: TaskStatus]}>()

const currentStatusAction = computed(() => STATUS_ACTIONS.find(({value}) => value === props.status) ?? STATUS_ACTIONS[0])

const showRing = computed(() => props.status === "done" || props.status === "discarded")
const ringClass = computed(() => {
  if (props.status === "done") return "border-success/60"
  if (props.status === "discarded") return "border-warning/60"
  return ""
})

function onSelectStatus(status: TaskStatus, hide?: () => void) {
  emit("update:status", status)
  hide?.()
}

function getStatusTriggerClass(status: TaskStatus) {
  if (status === "active") return "text-error hover:bg-error/10"
  if (status === "discarded") return "text-warning hover:bg-warning/10"
  if (status === "done") return "text-success hover:bg-success/10"
  return ""
}

function getStatusActionClass(status: TaskStatus) {
  if (props.status !== status) return "text-base-content/70 hover:bg-base-200 hover:text-base-content"
  if (status === "active") return "text-error bg-error/10 hover:bg-error/20"
  if (status === "discarded") return "text-warning bg-warning/10 hover:bg-warning/20"
  if (status === "done") return "text-success bg-success/10 hover:bg-success/20"
  return ""
}
</script>

<template>
  <BasePopup hide-header container-class="min-w-32 p-1" position="end" content-class="gap-1">
    <template #trigger="{toggle}">
      <div class="relative inline-block">
        <BaseButton
          variant="ghost"
          class="size-7 p-0"
          :class="getStatusTriggerClass(currentStatusAction.value)"
          :icon="currentStatusAction.icon"
          :tooltip="currentStatusAction.tooltip"
          icon-class="size-4"
          @click="toggle"
        />
        <div
          v-if="showRing"
          aria-hidden="true"
          class="status-ring pointer-events-none absolute inset-0 rounded-full border border-dashed"
          :class="ringClass"
        />
      </div>
    </template>

    <template #default="{hide}">
      <BaseButton
        v-for="status in STATUS_ACTIONS"
        :key="status.value"
        variant="ghost"
        class="w-full justify-start px-2 py-1 text-xs"
        :class="getStatusActionClass(status.value)"
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
