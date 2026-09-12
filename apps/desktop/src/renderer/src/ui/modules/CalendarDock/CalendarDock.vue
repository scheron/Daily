<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {onClickOutside, useEventListener, useNow} from "@vueuse/core"

import {toDateLabel, toISODate} from "@daily/std"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui/ui.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseCalendar from "@/ui/base/BaseCalendar"
import {useDropToDay} from "@/ui/base/BaseCalendar/composables/useDropToDay"
import {useDockMorph} from "./composables/useDockMorph"

type CrossFade = {timing: KeyframeAnimationOptions; enter: Keyframe[]; leave: Keyframe[]}

const CROSS_FADE: Record<"expand" | "collapse", CrossFade> = {
  expand: {
    timing: {duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)"},
    enter: [
      {opacity: 0, transform: "translateY(10px)"},
      {opacity: 0, transform: "translateY(10px)", offset: 0.5},
      {opacity: 1, transform: "translateY(0)"},
    ],
    leave: [
      {opacity: 0, transform: "none", offset: 1 / 3},
      {opacity: 0, transform: "none"},
    ],
  },
  collapse: {
    timing: {duration: 300, easing: "cubic-bezier(0.4, 0, 1, 1)"},
    enter: [{opacity: 0}, {opacity: 0, offset: 2 / 3}, {opacity: 1}],
    leave: [
      {opacity: 0, transform: "translateY(10px)", offset: 0.4},
      {opacity: 0, transform: "translateY(10px)"},
    ],
  },
}

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const dragDropStore = useDragDropStore()
const taskEditorStore = useTaskEditorStore()

const rootRef = ref<HTMLElement | null>(null)
const now = useNow()

const today = computed(() => toISODate(now.value))
const label = computed(() => {
  const text = toDateLabel(tasksStore.activeDay, {year: false})
  return tasksStore.activeDay === today.value ? `Today, ${text}` : text
})

let expandedBeforeDrag = false
let ignoreNextOutsideClick = false

useDropToDay()
useDockMorph(rootRef, () => uiStore.calendarDockExpanded)

onClickOutside(rootRef, () => {
  if (dragDropStore.draggingTaskId || ignoreNextOutsideClick) return
  uiStore.toggleCalendarDock(false)
})

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented) return
  if (!uiStore.calendarDockExpanded) return
  uiStore.toggleCalendarDock(false)
})

watch(
  () => dragDropStore.draggingTaskId,
  (taskId) => {
    if (taskId) {
      expandedBeforeDrag = uiStore.calendarDockExpanded
      uiStore.toggleCalendarDock(true)
      return
    }

    uiStore.toggleCalendarDock(expandedBeforeDrag)
    ignoreNextOutsideClick = true
    setTimeout(() => (ignoreNextOutsideClick = false), 0)
  },
  {flush: "sync"},
)

watch(
  () => taskEditorStore.isOpen,
  (isOpen) => {
    if (isOpen) uiStore.toggleCalendarDock(false)
  },
)

function onEnter(el: Element, done: () => void) {
  const node = el as HTMLElement
  if (typeof node.animate !== "function") return done()

  const {enter, timing} = currentCrossFade()
  node.style.width = `${node.offsetWidth}px`

  node.animate(enter, timing).finished.then(() => {
    node.style.width = ""
    done()
  }, done)
}

function onLeave(el: Element, done: () => void) {
  const node = el as HTMLElement
  const root = rootRef.value
  if (!root || typeof node.animate !== "function") return done()

  const {leave, timing} = currentCrossFade()
  const {opacity, transform} = getComputedStyle(node)
  const width = node.offsetWidth

  node.getAnimations().forEach((animation) => animation.cancel())

  const borderBottom = parseFloat(getComputedStyle(root).borderBottomWidth) || 0
  const bottom = root.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom - borderBottom

  Object.assign(node.style, {
    position: "absolute",
    left: "50%",
    bottom: `${bottom}px`,
    width: `${width}px`,
    translate: "-50% 0",
    pointerEvents: "none",
  })

  node.animate([{opacity, transform}, ...leave], timing).finished.then(done, done)
}

function currentCrossFade() {
  return uiStore.calendarDockExpanded ? CROSS_FADE.expand : CROSS_FADE.collapse
}
</script>

<template>
  <div
    v-if="!taskEditorStore.isOpen"
    ref="rootRef"
    data-day-drop-zone
    class="bg-base-100 border-base-300 absolute bottom-3.5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center justify-end overflow-hidden rounded-2xl border shadow-lg"
    :class="{'w-90': uiStore.calendarDockExpanded}"
  >
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="uiStore.calendarDockExpanded" class="w-full p-1">
        <BaseCalendar size="sm" :days="tasksStore.days" :selected-date="tasksStore.activeDay" @select-date="tasksStore.setActiveDay" />
      </div>

      <BaseButton v-else variant="primary-ghost" class="h-8 font-semibold whitespace-nowrap" @click="uiStore.toggleCalendarDock(true)">
        {{ label }}
      </BaseButton>
    </Transition>
  </div>
</template>
