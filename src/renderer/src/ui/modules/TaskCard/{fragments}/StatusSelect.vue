<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import {STATUS_ACTIONS} from "../model/constants"

import type {TaskStatus} from "@shared/types/storage"

const props = withDefaults(defineProps<{status: TaskStatus}>(), {status: "active"})
const emit = defineEmits<{"update:status": [status: TaskStatus]}>()

const currentStatusAction = computed(() => STATUS_ACTIONS.find(({value}) => value === props.status) ?? STATUS_ACTIONS[0])

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
      <BaseButton
        variant="ghost"
        class="size-7 p-0"
        :class="getStatusTriggerClass(currentStatusAction.value)"
        :icon="currentStatusAction.icon"
        :tooltip="currentStatusAction.tooltip"
        icon-class="size-4"
        @click="toggle"
      />
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
        {{ status.label }}
      </BaseButton>
    </template>
  </BasePopup>
</template>
