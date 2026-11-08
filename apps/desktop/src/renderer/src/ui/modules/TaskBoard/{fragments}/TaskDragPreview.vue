<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from "vue"
import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {toDurationLabel} from "@daily/std"

import {useDragDropStore} from "@/stores/drag-drop"
import {useTasksStore} from "@/stores/tasks"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {toTaskTitle} from "@shared/utils/tasks/toTaskTitle"

import type {IconName} from "@/types/icons"
import type {TaskStatus} from "@daily/protocol"

let pointerX = 0
let pointerY = 0

const tasksStore = useTasksStore()
const dragDropStore = useDragDropStore()

const {draggingTaskId, isOverDropZone} = storeToRefs(dragDropStore)

const previewRef = useTemplateRef<HTMLElement>("preview")

const task = computed(() => (draggingTaskId.value ? tasksStore.findTaskById(draggingTaskId.value) : null))
const title = computed(() => (task.value ? toTaskTitle(task.value.content) : ""))
const estimateLabel = computed(() => (task.value && task.value.estimatedTime > 0 ? toDurationLabel(task.value.estimatedTime) : ""))

const icon = computed<IconName>(() => {
  const icons = {
    ready_for_agent: "bot",
    ready_to_merge: "git-pull-request",
    backlog: "bookmark",
    todo: "brain",
    in_progress: "fire",
    done: "check-check",
    cancelled: "archive",
  } satisfies Record<TaskStatus, IconName>
  return task.value ? icons[task.value.status] : "bookmark"
})

useEventListener(window, "pointermove", onPointerMove)

const previewClass = computed(() =>
  cn(
    "bg-base-100/80 border-base-300/70 dark:border-base-300 pointer-events-none fixed top-0 left-0 z-[100001] flex h-[44px] w-[346px] shrink-0 -rotate-[1.6deg] items-center gap-2.5 overflow-hidden rounded-full border px-[18px] opacity-90 shadow-lg backdrop-blur-sm transition-[width,height,padding,border-color] duration-200 ease-out",
    {"border-accent dark:border-accent h-[32px] w-[168px] px-[14px]": isOverDropZone.value},
  ),
)
const iconClass = computed(() =>
  cn("size-4 shrink-0", {
    "text-base-content/80": task.value?.status === "todo",
    "text-accent": task.value?.status === "in_progress",
    "text-error": task.value?.status === "ready_for_agent",
    "text-info": task.value?.status === "ready_to_merge",
    "text-warning": task.value?.status === "cancelled",
    "text-success": task.value?.status === "done",
    "text-base-content/60": task.value?.status === "backlog",
  }),
)

function onPointerMove(event: PointerEvent) {
  pointerX = event.clientX
  pointerY = event.clientY
  place()
}

function place() {
  if (!previewRef.value) return

  const anchorX = 26
  const anchorY = 22

  previewRef.value.style.translate = `${pointerX - anchorX}px ${pointerY - anchorY}px`
}

watch(draggingTaskId, async (id) => {
  if (!id) return
  await nextTick()
  place()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="task" ref="preview" :class="previewClass">
      <BaseIcon :name="icon" :class="iconClass" />
      <span class="min-w-0 flex-1 truncate text-sm">{{ title }}</span>

      <span v-if="estimateLabel && !isOverDropZone" class="text-base-content/80 inline-flex shrink-0 items-center gap-1 text-xs">
        <BaseIcon name="stopwatch" class="text-accent size-3.5" />
        {{ estimateLabel }}
      </span>
    </div>
  </Teleport>
</template>
