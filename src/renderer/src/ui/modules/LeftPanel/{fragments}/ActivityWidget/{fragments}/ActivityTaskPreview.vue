<script setup lang="ts">
import {ref} from "vue"

import BasePopup from "@/ui/base/BasePopup.vue"

import {API} from "@/api"
import {useHoverAbortController} from "../composables/useHoverAbortController"
import ActivityTaskPreviewCard from "./ActivityTaskPreviewCard.vue"

import type {Task} from "@shared/types/storage"

const props = withDefaults(
  defineProps<{
    taskId: Task["id"]
    isDeleted?: boolean
  }>(),
  {isDeleted: false},
)
const emit = defineEmits<{open: []}>()

const task = ref<Task | null>(null)
const message = ref<string | null>(null)
const {start, cancel, finish, waitForHover} = useHoverAbortController()

async function showTask(show: () => void) {
  const controller = start()
  task.value = null
  message.value = null

  try {
    if (props.isDeleted) {
      message.value = "Task deleted"
      show()
      return
    }

    await waitForHover(controller.signal)
    const loadedTask = await API.getTask(props.taskId)
    if (controller.signal.aborted) return

    if (!loadedTask || loadedTask.deletedAt) {
      message.value = loadedTask?.deletedAt ? "Task deleted" : "Task unavailable"
      show()
      return
    }

    task.value = loadedTask
    show()
  } catch {
    if (!controller.signal.aborted) message.value = "Task unavailable"
  } finally {
    finish(controller)
  }
}
</script>

<template>
  <BasePopup hover-mode hide-header container-class="w-80 max-h-[min(24rem,calc(100vh-2rem))] overflow-hidden p-0" content-class="block">
    <template #trigger="{show}">
      <slot name="trigger" :show="showTask.bind(null, show)" :cancel="cancel" :open="() => emit('open')" />
    </template>

    <div class="pointer-events-none">
      <ActivityTaskPreviewCard v-if="task" :task="task" />
      <p v-else-if="message" class="text-base-content/60 px-3 py-2 text-xs">{{ message }}</p>
    </div>
  </BasePopup>
</template>
