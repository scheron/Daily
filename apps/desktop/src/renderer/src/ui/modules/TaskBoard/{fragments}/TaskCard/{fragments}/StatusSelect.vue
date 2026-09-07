<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import StatusPicker from "@/ui/common/pickers/StatusPicker.vue"

import type {TaskStatus} from "@daily/protocol"

const props = withDefaults(defineProps<{status: TaskStatus}>(), {status: "active"})
const emit = defineEmits<{"update:status": [status: TaskStatus]}>()

const model = computed({
  get: () => props.status,
  set: (status: TaskStatus) => emit("update:status", status),
})

const showRing = computed(() => props.status === "done" || props.status === "discarded")
const ringClass = computed(() => {
  if (props.status === "done") return "border-success/60"
  if (props.status === "discarded") return "border-warning/60"
  return ""
})
</script>

<template>
  <StatusPicker v-model="model" position="end" container-class="min-w-32 p-1">
    <template #trigger="{toggle, current, colorClass}">
      <div class="relative inline-block">
        <BaseButton
          variant="ghost"
          class="size-7 p-0"
          :class="colorClass"
          :icon="current.icon"
          :tooltip="current.tooltip"
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
  </StatusPicker>
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
