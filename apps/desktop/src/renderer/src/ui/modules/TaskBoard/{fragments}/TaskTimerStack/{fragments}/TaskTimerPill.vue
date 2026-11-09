<script setup lang="ts">
import {computed} from "vue"

import {toTaskIdHash} from "@daily/protocol"

import {useTaskTimersStore} from "@/stores/task-timers"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task} from "@daily/protocol"
import type {TaskTimer} from "@shared/types/taskTimer"

const props = defineProps<{timer: TaskTimer; previewId: string; isPreviewVisible: boolean}>()
const emit = defineEmits<{
  open: []
  preview: [taskId: Task["id"], event: PointerEvent | FocusEvent]
  leavePreview: [event: PointerEvent | FocusEvent]
}>()

const taskTimersStore = useTaskTimersStore()

const taskHash = computed(() => toTaskIdHash(props.timer.taskId))
const isPaused = computed(() => !props.timer.isRunning)
const isPending = computed(() => taskTimersStore.isPending(props.timer.taskId))
const elapsed = computed(() => {
  const total = taskTimersStore.elapsedSeconds(props.timer)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`

  return hours > 0 ? `${hours}:${clock}` : clock
})
const pillClass = computed(() => cn({"border-accent/30 bg-accent/10": props.isPreviewVisible}))
const clockClass = computed(() => cn([isPaused.value ? "text-base-content/55" : "text-accent"]))
const toggleLabel = computed(() => `${isPaused.value ? "Resume" : "Pause"} timer for task ${taskHash.value}`)
const previewAttrs = computed(() => (props.isPreviewVisible ? {"aria-describedby": props.previewId} : {}))

function onToggle() {
  void taskTimersStore.dispatch({type: isPaused.value ? "resume" : "pause", taskId: props.timer.taskId})
}

function onStop() {
  void taskTimersStore.dispatch({type: "stop", taskId: props.timer.taskId})
}
</script>

<template>
  <div
    class="dock-surface h-7.5 min-w-39 flex items-center whitespace-nowrap rounded-full px-0.5 transition-colors"
    :class="pillClass"
    :data-task-timer-id="timer.taskId"
  >
    <BaseButton
      type="button"
      variant="ghost-muted"
      size="xs"
      class="flex-1 justify-start"
      data-task-timer-open
      v-bind="previewAttrs"
      @pointerenter="emit('preview', timer.taskId, $event)"
      @pointerleave="emit('leavePreview', $event)"
      @focus="emit('preview', timer.taskId, $event)"
      @blur="emit('leavePreview', $event)"
      @click="emit('open')"
    >
      <span class="sr-only">Open task</span>
      <BaseIcon name="stopwatch" class="size-3.5 shrink-0" :class="clockClass" aria-hidden="true" />
      <span class="font-mono text-[0.6875rem]">{{ taskHash }}</span>
      <span class="font-mono tabular-nums" :class="clockClass" data-task-timer-elapsed>{{ elapsed }}</span>
    </BaseButton>

    <span class="bg-base-300 mx-px h-3 w-px" aria-hidden="true" />
    <BaseButton
      type="button"
      :variant="isPaused ? 'primary-ghost' : 'ghost-muted'"
      size="xs"
      :icon="isPaused ? 'play' : 'pause'"
      :aria-label="toggleLabel"
      :disabled="isPending"
      @click="onToggle"
    />
    <BaseButton
      type="button"
      variant="ghost-muted"
      size="xs"
      icon="stop"
      :aria-label="`Stop timer for task ${taskHash}`"
      :disabled="isPending"
      @click="onStop"
    />
  </div>
</template>
