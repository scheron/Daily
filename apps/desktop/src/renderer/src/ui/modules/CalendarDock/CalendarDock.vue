<script setup lang="ts">
import {useTemplateRef} from "vue"

import {useBoardDrop} from "@/composables/tasks/useBoardDrop"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import BaseButton from "@/ui/base/BaseButton"
import TaskCalendar from "@/ui/common/calendar/TaskCalendar"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useDockCrossFade} from "./composables/useDockCrossFade"
import {useDockDragHover} from "./composables/useDockDragHover"
import {useDockHover} from "./composables/useDockHover"
import {useDockMorph} from "./composables/useDockMorph"
import {useDockPill} from "./composables/useDockPill"
import {useDockTabs} from "./composables/useDockTabs"
import {useDockVisibility} from "./composables/useDockVisibility"
import MilestoneList from "./{fragments}/MilestoneList.vue"

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const filterStore = useFilterStore()

const dockRef = useTemplateRef<HTMLElement>("dock")

const {tabs, hasMilestones, dockTab, dockWidthClass, selectTab} = useDockTabs()
const {dayLabel, framedMilestone, framedMilestoneCompletion, framedMilestoneOverdue} = useDockPill()
const {onEnter, onLeave} = useDockCrossFade(dockRef)

useBoardDrop()
useDockVisibility()
useDockDragHover()
useDockHover(dockRef)
useDockMorph(dockRef, dockTab)

function getDockClasses() {
  return cn(dockWidthClass.value, uiStore.isCalendarDockExpanded ? "rounded-2xl" : "rounded-[20px]")
}

function getTabVariant(isActive: boolean) {
  return isActive ? "primary" : "ghost-muted"
}
</script>

<template>
  <div
    ref="dock"
    data-day-drop-zone
    class="dock-surface absolute top-2 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center justify-start overflow-hidden [-webkit-app-region:no-drag]"
    :class="getDockClasses()"
  >
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="uiStore.isCalendarDockExpanded" class="flex w-full flex-col gap-1 p-1">
        <div class="min-h-70">
          <TaskCalendar
            v-if="dockTab === 'days'"
            :days="tasksStore.days"
            :selected-date="tasksStore.activeDay"
            @select-date="tasksStore.setActiveDay"
          />
          <MilestoneList v-else />
        </div>

        <div v-if="hasMilestones" class="flex items-center gap-1">
          <BaseButton
            v-for="item in tabs"
            :key="item.id"
            :data-tab="item.id"
            :variant="getTabVariant(dockTab === item.id)"
            :icon="item.icon"
            size="sm"
            class="flex-1"
            @click="selectTab(item.id)"
          >
            {{ item.label }}
          </BaseButton>
        </div>
      </div>

      <div v-else data-dock-pill class="text-accent flex h-8 items-center gap-1 px-3 text-sm font-semibold whitespace-nowrap">
        <span v-if="filterStore.frame === 'milestone' && framedMilestone" class="inline-flex min-w-0 items-center gap-1.5">
          <MilestoneDiamond :completion="framedMilestoneCompletion" :overdue="framedMilestoneOverdue" :size="12" />
          <span class="max-w-32 min-w-0 truncate">{{ framedMilestone.name }}</span>
        </span>
        <template v-else-if="filterStore.frame === 'milestone'">All milestones</template>
        <template v-else>{{ dayLabel }}</template>
      </div>
    </Transition>
  </div>
</template>
