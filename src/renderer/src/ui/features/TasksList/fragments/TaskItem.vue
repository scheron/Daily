<script setup lang="ts">
import {computed, useTemplateRef, watch} from "vue"
import {until, useEventListener} from "@vueuse/core"

import {useDevice} from "@/composables/useDevice"
import {useMarkdown} from "@/composables/useMarkdown"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseTag from "@/ui/base/BaseTag.vue"
import {useSwipeGestures} from "../model/useSwipeGestures"
import {useSwipeState} from "../model/useSwipeState"
import {useTapGestures} from "../model/useTapGestures"
import TaskItemAction from "./TaskItemAction.vue"

import type {Tag, Task, TaskStatus} from "@/types/tasks"

const VISIBLE_TAGS_COUNT = 5

const emit = defineEmits<{"change-status": [status: TaskStatus]; edit: []}>()
const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {
  tags: () => [],
})

const containerRef = useTemplateRef<HTMLDivElement>("container")
const contentRef = useTemplateRef<HTMLElement>("content")

const {isMobile} = useDevice()
const {renderMarkdown} = useMarkdown()

const {isActive, leftOpacity, rightOpacity, shouldLeftActionTrigger, shouldRightActionTrigger, offset, ...swipeActions} = useSwipeState({
  maxSwipe: computed(() => (isMobile.value ? 80 : 100)),
  actionThreshold: computed(() => (isMobile.value ? 55 : 70)),
  onTrigger: (dir) => {
    if (dir === "right") emit("change-status", props.task.status === "done" ? "active" : "done")
    if (dir === "left") emit("change-status", props.task.status === "discarded" ? "active" : "discarded")
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
    class="bg-base-100 focus-visible-ring focus-visible:ring-primary border border-base-300 relative overflow-hidden rounded-md outline-none"
    tabindex="0"
    @keydown.enter="emit('edit')"
  >
    <div ref="container" class="relative min-h-11 h-full shrink-0 touch-pan-y touch-pinch-zoom touch-none overflow-hidden select-none sm:min-h-12">
      <TaskItemAction
        class="justify-start"
        :class="task.status === 'done' ? 'bg-base-300' : 'bg-success/60'"
        :opacity="leftOpacity"
        :should-action-trigger="shouldLeftActionTrigger"
      >
        <BaseIcon v-if="task.status !== 'done'" name="check-check" class="text-base-content size-5 sm:size-6" />
        <BaseIcon v-else name="undo" class="text-base-content size-5 sm:size-6" />
      </TaskItemAction>

      <TaskItemAction
        :opacity="rightOpacity"
        :class="task.status === 'discarded' ? 'bg-base-300' : 'bg-warning/60'"
        :should-action-trigger="shouldRightActionTrigger"
        class="justify-end"
      >
        <BaseIcon v-if="task.status !== 'discarded'" name="archive" class="text-base-content size-5 sm:size-6" />
        <BaseIcon v-else name="undo" class="text-base-content size-5 sm:size-6" />
      </TaskItemAction>

      <div
        class="bg-success absolute top-0 left-0 z-30 w-2 rounded-l-sm transition-all duration-500"
        :class="[task.status === 'done' ? 'h-full opacity-100' : 'h-0 opacity-0']"
      />

      <div
        class="bg-warning absolute top-0 left-0 z-30 w-2 rounded-l-sm transition-all duration-500"
        :class="[task.status === 'discarded' ? 'h-full opacity-100' : 'h-0 opacity-0']"
      />

      <div :style="swipeStyle" class="group bg-base-100 pr-4 py-2 pl-6 relative flex flex-col h-full">
        <div v-if="tags.length" class="flex mb-1 gap-1 items-center">
          <BaseTag v-for="tag in tags.slice(0, VISIBLE_TAGS_COUNT)" :key="tag.id" :tag="tag" class="py-0.5 px-1" />
          <div v-if="tags.length > VISIBLE_TAGS_COUNT" class="text-xs text-info font-semibold bg-info/20 rounded-xl px-2 py-0.5">
            +{{ tags.length - VISIBLE_TAGS_COUNT }}
          </div>
        </div>

        <div class="flex-1">
          <div
            ref="content"
            class="markdown max-w-full flex-1 cursor-default overflow-x-auto rounded-md p-1 break-words break-all transition-opacity duration-200 outline-none"
            :class="{'line-through opacity-50': ['done', 'discarded'].includes(task.status)}"
          />
        </div>
      </div>
    </div>
  </div>
</template>
