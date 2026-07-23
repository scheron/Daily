<script lang="ts">
let activePreviewController: AbortController | null = null
</script>

<script setup lang="ts">
import {ref} from "vue"

import BasePopup from "@/ui/base/BasePopup.vue"

import {API} from "@/api"
import ActivityTaskPreviewCard from "./ActivityTaskPreviewCard.vue"

import type {Task} from "@shared/types/storage"

const HOVER_DELAY_MS = 150

const props = defineProps<{taskId: Task["id"]}>()
const emit = defineEmits<{open: []}>()

const task = ref<Task | null>(null)
let controller: AbortController | null = null

function waitForHover(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, HOVER_DELAY_MS)

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId)
        reject(signal.reason)
      },
      {once: true},
    )
  })
}

async function showTask(show: () => void) {
  activePreviewController?.abort()

  const previewController = new AbortController()
  controller = previewController
  activePreviewController = previewController
  task.value = null

  try {
    await waitForHover(previewController.signal)
    const loadedTask = await API.getTask(props.taskId)
    if (previewController.signal.aborted || !loadedTask || loadedTask.deletedAt) return

    task.value = loadedTask
    show()
  } catch {
    if (!previewController.signal.aborted) task.value = null
  } finally {
    if (activePreviewController === previewController) activePreviewController = null
    if (controller === previewController) controller = null
  }
}

function cancelTaskPreview() {
  controller?.abort()
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
