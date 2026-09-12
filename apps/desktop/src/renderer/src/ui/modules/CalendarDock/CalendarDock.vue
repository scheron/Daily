<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {onClickOutside, useEventListener, useNow} from "@vueuse/core"

import {isMilestoneOverdue, milestoneCompletion} from "@daily/protocol"
import {getToday, toDateLabel, toISODate} from "@daily/std"

import {useBoardDrop} from "@/composables/tasks/useBoardDrop"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui/ui.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseIcon from "@/ui/base/BaseIcon"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"
import {findClosestAtPoint} from "@/utils/ui/dom"
import {useDockMorph} from "./composables/useDockMorph"
import MilestoneList from "./{fragments}/MilestoneList.vue"

import type {IconName} from "@/ui/base/BaseIcon"

type CrossFade = {timing: KeyframeAnimationOptions; enter: Keyframe[]; leave: Keyframe[]}
type DockTab = "days" | "milestones"

const TAB_DWELL_MS = 250

const DOCK_TABS: {id: DockTab; label: string; icon: IconName}[] = [
  {id: "days", label: "Days", icon: "calendar"},
  {id: "milestones", label: "Milestones", icon: "milestone"},
]

const TAB_CLASS = "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors"
const TAB_ACTIVE_CLASS = "bg-accent/15 text-accent"
const TAB_INACTIVE_CLASS = "text-base-content/60 hover:bg-base-200 hover:text-base-content"

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
    enter: [{opacity: 0}, {opacity: 0, offset: 0.3}, {opacity: 1}],
    leave: [
      {opacity: 0, transform: "translateY(10px)", offset: 0.6},
      {opacity: 0, transform: "translateY(10px)"},
    ],
  },
}

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const dragDropStore = useDragDropStore()
const taskEditorStore = useTaskEditorStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()

const rootRef = ref<HTMLElement | null>(null)
const now = useNow()

const today = computed(() => toISODate(now.value))
const label = computed(() => {
  const text = toDateLabel(tasksStore.activeDay, {year: false})
  return tasksStore.activeDay === today.value ? `Today, ${text}` : text
})
const framedMilestone = computed(() =>
  filterStore.activeMilestoneId ? (milestonesStore.milestonesMap.get(filterStore.activeMilestoneId) ?? null) : null,
)

const framedMilestoneCompletion = computed(() => (framedMilestone.value ? milestoneCompletion(framedMilestone.value.progress) : 0))

const framedMilestoneOverdue = computed(() =>
  framedMilestone.value ? isMilestoneOverdue(framedMilestone.value, framedMilestone.value.progress, getToday()) : false,
)

const hasMilestones = computed(() => milestonesStore.activeMilestones.length > 0)

/**
 * Clicking a tab is what changes what the board is showing. The hover dwell during a drag moves
 * only this panel, so a card in flight can reach the other surface without reframing the board
 * underneath it.
 */
function onTabClick(tab: DockTab) {
  uiStore.setCalendarDockTab(tab)
  filterStore.setFrame(tab === "milestones" ? "milestone" : "day")
}

const dockTab = computed<DockTab>(() => (hasMilestones.value ? uiStore.calendarDockTab : "days"))

const dockWidthClass = computed(() => {
  if (!uiStore.calendarDockExpanded) return ""
  return dockTab.value === "milestones" ? "w-128" : "w-90"
})

let expandedBeforeDrag = false
let ignoreNextOutsideClick = false
let tabDwellTimer: ReturnType<typeof setTimeout> | null = null
let panelWidthBeforeCollapse = 0
let pendingDwellTab: DockTab | null = null

useBoardDrop()
watch(hasMilestones, (has) => {
  if (has) return
  if (uiStore.calendarDockTab !== "days") uiStore.setCalendarDockTab("days")
  if (filterStore.frame !== "day") filterStore.setFrame("day")
})

useDockMorph(
  rootRef,
  () => uiStore.calendarDockExpanded,
  () => dockTab.value,
)

onClickOutside(rootRef, () => {
  if (dragDropStore.draggingTaskId || ignoreNextOutsideClick) return
  uiStore.toggleCalendarDock(false)
})

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented) return
  if (!uiStore.calendarDockExpanded) return
  uiStore.toggleCalendarDock(false)
})

function clearTabDwell() {
  if (tabDwellTimer) clearTimeout(tabDwellTimer)
  tabDwellTimer = null
  pendingDwellTab = null
}

/**
 * While a card is in flight, SortableJS's fallback clone sits under the cursor and swallows
 * pointer events on the tab itself — resolved by position, exactly as the day drop resolves
 * its target. A tab switches only after the pointer dwells on it for `TAB_DWELL_MS`; any
 * movement off that tab cancels the pending switch, so a pointer merely crossing the tab row
 * on its way into the panel below does not flip it.
 */
function onDragPointerMove(event: PointerEvent) {
  if (!dragDropStore.draggingTaskId) return

  const tabEl = findClosestAtPoint(event.clientX, event.clientY, "[data-tab]")
  const tab = tabEl?.dataset.tab as DockTab | undefined

  if (!tab || tab === uiStore.calendarDockTab) {
    clearTabDwell()
    return
  }

  if (tab === pendingDwellTab) return

  clearTabDwell()
  pendingDwellTab = tab
  tabDwellTimer = setTimeout(() => {
    uiStore.setCalendarDockTab(tab)
    pendingDwellTab = null
    tabDwellTimer = null
  }, TAB_DWELL_MS)
}

useEventListener(window, "pointermove", onDragPointerMove)

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
  () => dragDropStore.draggingTaskId,
  (taskId) => {
    if (!taskId) clearTabDwell()
  },
)

watch(
  () => uiStore.calendarDockExpanded,
  (expanded) => {
    if (expanded) return
    const panel = rootRef.value?.querySelector<HTMLElement>(":scope > div")
    panelWidthBeforeCollapse = panel?.offsetWidth ?? 0
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
  const width = panelWidthBeforeCollapse || node.offsetWidth

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
    :class="dockWidthClass"
  >
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="uiStore.calendarDockExpanded" class="flex w-full flex-col gap-1 p-1">
        <div v-if="hasMilestones" class="flex items-center gap-1">
          <button
            v-for="item in DOCK_TABS"
            :key="item.id"
            :data-tab="item.id"
            :class="[TAB_CLASS, dockTab === item.id ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS]"
            @click="onTabClick(item.id)"
          >
            <BaseIcon :name="item.icon" class="size-5" />
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="min-h-70">
          <BaseCalendar
            v-if="dockTab === 'days'"
            size="sm"
            :days="tasksStore.days"
            :selected-date="tasksStore.activeDay"
            @select-date="tasksStore.setActiveDay"
          />
          <MilestoneList v-else />
        </div>
      </div>

      <BaseButton v-else variant="primary-ghost" class="h-8 font-semibold whitespace-nowrap" @click="uiStore.toggleCalendarDock(true)">
        <span v-if="filterStore.frame === 'milestone' && framedMilestone" class="inline-flex min-w-0 items-center gap-1.5">
          <MilestoneDiamond :completion="framedMilestoneCompletion" :overdue="framedMilestoneOverdue" :size="12" />
          <span class="min-w-0 truncate">{{ framedMilestone.name }}</span>
        </span>
        <template v-else-if="filterStore.frame === 'milestone'">All milestones</template>
        <template v-else>{{ label }}</template>
      </BaseButton>
    </Transition>
  </div>
</template>
