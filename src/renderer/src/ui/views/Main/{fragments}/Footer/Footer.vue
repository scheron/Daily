<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from "vue"

import {ISODate} from "@shared/types/common"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {draggingTaskId} from "@/composables/useTaskDragDrop"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"
import BaseButton from "@/ui/base/BaseButton.vue"

import ContinuousCalendar from "./ContinuousCalendar.vue"
import WeekStrip from "./WeekStrip.vue"

const props = defineProps<{activeDay: string; footerHeight: number}>()

const tasksStore = useTasksStore()
const uiStore = useUIStore()

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
  <div class="app-footer border-base-300 border-t px-4" :style="{height: `${props.footerHeight}px`}">
    <div v-if="!uiStore.calendarExpanded" class="flex h-full w-full items-center justify-between gap-2">
      <WeekStrip :active-day="props.activeDay" :drop-target-date="dropTargetDate" />
      <BaseButton variant="ghost" icon="chevron-up" class="p-0.5" tooltip="Expand calendar" @click="uiStore.toggleCalendarExpanded()" />
    </div>

    <div v-else class="flex h-full w-full items-stretch gap-1 py-1">
      <ContinuousCalendar :active-day="props.activeDay" :drop-target-date="dropTargetDate" class="min-w-0 flex-1" />
      <BaseButton
        variant="ghost"
        icon="chevron-down"
        class="self-start p-0.5"
        tooltip="Collapse calendar"
        @click="uiStore.toggleCalendarExpanded()"
      />
    </div>
  </div>
</template>
