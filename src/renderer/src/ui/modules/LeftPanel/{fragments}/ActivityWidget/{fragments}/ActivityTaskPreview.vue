<script setup lang="ts">
import {ref} from "vue"

import BasePopup from "@/ui/base/BasePopup.vue"

import {API} from "@/api"
import ActivityTaskPreviewCard from "./ActivityTaskPreviewCard.vue"

import type {Task} from "@shared/types/storage"

const props = defineProps<{taskId: Task["id"]}>()
const emit = defineEmits<{open: []}>()

const task = ref<Task | null>(null)
let requestId = 0

async function showTask(show: () => void) {
  const currentRequestId = ++requestId
  task.value = null

  try {
    const loadedTask = await API.getTask(props.taskId)
    if (currentRequestId !== requestId || !loadedTask || loadedTask.deletedAt) return

    task.value = loadedTask
    show()
  } catch {
    task.value = null
  }
}

function cancelTaskPreview() {
  requestId += 1
}
</script>

<template>
  <BasePopup hover-mode hide-header container-class="w-80 max-h-[min(24rem,calc(100vh-2rem))] overflow-hidden p-0" content-class="block">
    <template #trigger="{show}">
      <slot name="trigger" :show="showTask.bind(null, show)" :cancel="cancelTaskPreview" :open="() => emit('open')" />
    </template>

    <div class="pointer-events-none">
      <ActivityTaskPreviewCard v-if="task" :task="task" />
    </div>
  </BasePopup>
</template>
