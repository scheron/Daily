<script setup lang="ts">
import {useTemplateRef} from "vue"

import {useBoardDrop} from "@/composables/tasks/useBoardDrop"
import {useFilterStore} from "@/stores/filter.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import TaskCalendar from "@/ui/common/calendar/TaskCalendar"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useDockCrossFade} from "./composables/useDockCrossFade"
import {useDockDragHover} from "./composables/useDockDragHover"
import {useDockMorph} from "./composables/useDockMorph"
import {useDockPill} from "./composables/useDockPill"
import {useDockTabs} from "./composables/useDockTabs"
import {useDockVisibility} from "./composables/useDockVisibility"
import MilestoneList from "./{fragments}/MilestoneList.vue"

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const taskEditorStore = useTaskEditorStore()
const filterStore = useFilterStore()

const dockRef = useTemplateRef<HTMLElement>("dock")

const {tabs, hasMilestones, dockTab, dockWidthClass, selectTab} = useDockTabs()
const {dayLabel, framedMilestone, framedMilestoneCompletion, framedMilestoneOverdue} = useDockPill()
const {onEnter, onLeave} = useDockCrossFade(dockRef)

useBoardDrop()
useDockVisibility(dockRef)
useDockDragHover()
useDockMorph(dockRef, dockTab)

function getTabClasses(isActive: boolean) {
  return cn(
    "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
    isActive ? "bg-accent/15 text-accent" : "text-base-content/60 hover:bg-base-200 hover:text-base-content",
  )
}
</script>

<template>
  <div
    v-if="!taskEditorStore.isOpen"
    ref="dock"
    data-day-drop-zone
    class="bg-base-100 border-base-300 absolute bottom-3.5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center justify-end overflow-hidden rounded-2xl border shadow-lg"
    :class="dockWidthClass"
  >
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="uiStore.isCalendarDockExpanded" class="flex w-full flex-col gap-1 p-1">
        <div v-if="hasMilestones" class="flex items-center gap-1">
          <button v-for="item in tabs" :key="item.id" :data-tab="item.id" :class="getTabClasses(dockTab === item.id)" @click="selectTab(item.id)">
            <BaseIcon :name="item.icon" class="size-5" />
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="min-h-70">
          <TaskCalendar
            v-if="dockTab === 'days'"
            :days="tasksStore.days"
            :selected-date="tasksStore.activeDay"
            @select-date="tasksStore.setActiveDay"
          />
          <MilestoneList v-else />
        </div>
      </div>

      <BaseButton v-else data-dock-pill variant="primary-ghost" class="h-8 font-semibold whitespace-nowrap" @click="uiStore.toggleCalendarDock(true)">
        <span v-if="filterStore.frame === 'milestone' && framedMilestone" class="inline-flex min-w-0 items-center gap-1.5">
          <MilestoneDiamond :completion="framedMilestoneCompletion" :overdue="framedMilestoneOverdue" :size="12" />
          <span class="min-w-0 truncate">{{ framedMilestone.name }}</span>
        </span>
        <template v-else-if="filterStore.frame === 'milestone'">All milestones</template>
        <template v-else>{{ dayLabel }}</template>
      </BaseButton>
    </Transition>
  </div>
</template>
