<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from "vue"

import {ISODate} from "@shared/types/common"
import {useTasksStore} from "@/stores/tasks.store"
import {draggingTaskId} from "@/composables/useTaskDragDrop"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import WeekStrip from "./WeekStrip.vue"

const props = defineProps<{activeDay: string}>()

const tasksStore = useTasksStore()

const dropTargetDate = ref<ISODate | null>(null)
const pendingDrop = ref<{taskId: string; date: ISODate} | null>(null)

// DOM contract: all droppable day cells inside `.app-footer` must render `data-drop-day="<ISODate>"` so this handler can resolve the target date.
function onPointerMove(event: PointerEvent) {
  const {clientX, clientY} = event
  const dayEl = findClosestAtPoint(clientX, clientY, "[data-drop-day]")
  const dragClone = findDragClone()

  const isOverFooter = Boolean(findClosestAtPoint(clientX, clientY, ".app-footer") || findClosestAtPoint(clientX, clientY, "[data-popup]"))

  if (isOverFooter) {
    dragClone?.classList.add("is-over-footer")
  } else {
    dragClone?.classList.remove("is-over-footer")
  }

  if (dayEl) {
    const date = dayEl.dataset.dropDay as ISODate
    dropTargetDate.value = date
    pendingDrop.value = {taskId: draggingTaskId.value!, date}
  } else {
    dropTargetDate.value = null
    pendingDrop.value = null
  }
}

function onPointerUp() {
  if (pendingDrop.value) {
    const {taskId, date} = pendingDrop.value
    pendingDrop.value = null
    dropTargetDate.value = null
    if (date !== props.activeDay) {
      tasksStore.moveTask(taskId, date)
    }
  }
  cleanup()
}

function cleanup() {
  window.removeEventListener("pointermove", onPointerMove)
  window.removeEventListener("pointerup", onPointerUp, true)
  dropTargetDate.value = null
  pendingDrop.value = null
  findDragClone()?.classList.remove("is-over-footer")
}

watch(draggingTaskId, (id) => {
  if (id) {
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp, true)
  } else {
    cleanup()
  }
})

onBeforeUnmount(cleanup)
</script>

<template>
  <div class="app-footer border-base-300 h-header border-t px-4">
    <WeekStrip :active-day="props.activeDay" :drop-target-date="dropTargetDate" />
  </div>
</template>
