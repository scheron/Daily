<script setup lang="ts">
import {computed, ref} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
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
const popupContainerClass = computed(() =>
  task.value ? "w-80 max-h-[min(24rem,calc(100vh-2rem))] overflow-hidden p-0" : "w-fit min-w-0 max-w-52 overflow-hidden rounded-xl p-0",
)
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
  <BasePopup hover-mode hide-header :container-class="popupContainerClass" content-class="block">
    <template #trigger="{show}">
      <slot name="trigger" :show="showTask.bind(null, show)" :cancel="cancel" :open="() => emit('open')" />
    </template>

    <div class="pointer-events-none">
      <ActivityTaskPreviewCard v-if="task" :task="task" />
      <div v-else-if="message" class="flex items-center gap-2 px-3 py-2">
        <BaseIcon
          :name="message === 'Task deleted' ? 'trash' : 'info'"
          :class="message === 'Task deleted' ? 'text-error/70 size-3.5' : 'text-base-content/45 size-3.5'"
        />
        <span class="text-base-content/70 text-xs whitespace-nowrap">{{ message }}</span>
      </div>
    </div>
  </BasePopup>
</template>
