<script setup lang="ts">
import {useMarkdown} from "@daily/composables/useMarkdown"
import {BaseIcon} from "@daily/ui/base"

import {computed, useTemplateRef, watch} from "vue"
import {until, useEventListener} from "@vueuse/core"

import {useDevice} from "@/composables/useDevice"
import {useSwipeGestures} from "../model/useSwipeGestures"
import {useSwipeState} from "../model/useSwipeState"
import {useTapGestures} from "../model/useTapGestures"
import TaskItemAction from "./TaskItemAction.vue"

import type {Task} from "@daily/types/tasks"

const emit = defineEmits<{"toggle-done": [boolean]; delete: []; edit: []}>()
const props = defineProps<{task: Task}>()

const containerRef = useTemplateRef<HTMLDivElement>("container")
const contentRef = useTemplateRef<HTMLElement>("content")

const {isMobile} = useDevice()
const {renderMarkdown} = useMarkdown()

const {isActive, leftOpacity, rightOpacity, shouldLeftActionTrigger, shouldRightActionTrigger, offset, ...swipeActions} = useSwipeState({
  maxSwipe: computed(() => (isMobile.value ? 80 : 100)),
  actionThreshold: computed(() => (isMobile.value ? 55 : 70)),
  onTrigger: (dir) => {
    if (dir === "right") emit("toggle-done", !props.task.done)
    if (dir === "left") emit("delete")
  },
})
const swipeGestures = useSwipeGestures({
  isActive,
  minSwipeDistance: computed(() => (isMobile.value ? 15 : 20)),
  ...swipeActions,
})

useTapGestures(containerRef, () => emit("edit"))

const swipeStyle = computed(() => ({
  transform: `translateX(${offset.value}px)`,
  transitionDuration: isActive.value ? "0ms" : "200ms",
}))

watch(
  () => props.task.content,
  async () => {
    await until(contentRef).toBeTruthy()

    if (contentRef.value) {
      contentRef.value.innerHTML = renderMarkdown(props.task.content)
    }
  },
  {immediate: true},
)

useEventListener(containerRef, "mousedown", swipeGestures.onMouseDown)
useEventListener(containerRef, "touchstart", swipeGestures.onTouchStart, {passive: false})
useEventListener(containerRef, "touchmove", swipeGestures.onTouchMove, {passive: false})
useEventListener(containerRef, "touchend", swipeGestures.onTouchEnd)
useEventListener(containerRef, "dblclick", () => emit("edit"))

useEventListener("mousemove", swipeGestures.onMouseMove, {passive: false})
useEventListener("mouseup", swipeGestures.onMouseUp, {passive: false})
</script>

<template>
  <div
    class="bg-base-100 focus-visible-ring focus-visible:ring-primary relative overflow-hidden rounded-md outline-none"
    tabindex="0"
    @keydown.enter="emit('edit')"
  >
    <div ref="container" class="relative min-h-11 shrink-0 touch-pan-y touch-pinch-zoom touch-none overflow-hidden select-none sm:min-h-12">
      <TaskItemAction
        class="justify-start"
        :class="task.done ? 'bg-base-300' : 'bg-success/60'"
        :opacity="leftOpacity"
        :should-action-trigger="shouldLeftActionTrigger"
      >
        <BaseIcon v-if="!task.done" name="check-check" class="text-base-content size-5 sm:size-6" />
        <BaseIcon v-else name="undo" class="text-base-content size-5 sm:size-6" />
      </TaskItemAction>

      <TaskItemAction :opacity="rightOpacity" :should-action-trigger="shouldRightActionTrigger" class="bg-error/60 justify-end">
        <BaseIcon name="x-mark" class="text-base-content size-5 sm:size-6" />
      </TaskItemAction>

      <div :style="swipeStyle" class="group bg-base-100 relative flex h-full flex-wrap items-center px-3 py-2 sm:px-5 sm:py-3">
        <div
          class="bg-success absolute top-0 left-0 z-30 w-2 rounded-l-sm transition-all duration-500"
          :class="[task.done ? 'h-full opacity-100' : 'h-0 opacity-0']"
        />

        <div
          ref="content"
          class="markdown max-w-full flex-1 cursor-default overflow-x-auto rounded-md p-1 break-words break-all transition-opacity duration-200 outline-none"
          :class="{'line-through opacity-50': task.done}"
        />
      </div>
    </div>
  </div>
</template>
