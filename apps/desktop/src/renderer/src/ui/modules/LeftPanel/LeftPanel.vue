<script setup lang="ts">
import {useAnimation} from "@/composables/useAnimation"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import BaseCalendar from "@/ui/base/BaseCalendar"
import MilestoneList from "./{fragments}/MilestoneList"
import PanelModeSwitch from "./{fragments}/PanelModeSwitch"
import SidebarColumn from "./{fragments}/SidebarColumn"

defineProps<{width: number}>()

const uiStore = useUIStore()
const tasksStore = useTasksStore()
const milestonesStore = useMilestonesStore()

const {onEnter, onLeave} = useAnimation("slide")
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <aside v-if="uiStore.leftPanelVisible" data-day-drop-zone class="bg-base-100 relative h-full shrink-0" :style="{width: width + 'px'}">
      <div class="flex h-full min-h-0 w-full flex-col" :style="{width: width + 'px'}">
        <div class="shrink-0 px-2 pt-2">
          <PanelModeSwitch />
        </div>

        <div class="shrink-0 px-1 py-2">
          <BaseCalendar
            v-if="milestonesStore.mode === 'day'"
            size="sm"
            :days="tasksStore.days"
            :selected-date="tasksStore.activeDay"
            @select-date="tasksStore.setActiveDay"
          />
          <MilestoneList v-else />
        </div>

        <div class="bg-base-300 h-px shrink-0" />

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SidebarColumn />
        </div>
      </div>
    </aside>
  </Transition>
</template>
