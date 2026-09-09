<script setup lang="ts">
import {ref, useTemplateRef, watch} from "vue"
import {useElementSize} from "@vueuse/core"

import {useAnimation} from "@/composables/useAnimation"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import BaseCalendar from "@/ui/base/BaseCalendar"
import MilestoneList from "./{fragments}/MilestoneList"
import SidebarColumn from "./{fragments}/SidebarColumn"

defineProps<{width: number}>()

const uiStore = useUIStore()
const tasksStore = useTasksStore()
const milestonesStore = useMilestonesStore()

const {onEnter, onLeave} = useAnimation("slide")

const calendarRef = useTemplateRef<HTMLDivElement>("calendarRef")
const {height: calendarHeight} = useElementSize(calendarRef)
const topAreaMinHeight = ref(0)

watch(calendarHeight, (height) => {
  if (height > 0) topAreaMinHeight.value = height
})
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <aside v-if="uiStore.leftPanelVisible" data-day-drop-zone class="bg-base-100 relative h-full shrink-0" :style="{width: width + 'px'}">
      <div class="flex h-full min-h-0 w-full flex-col" :style="{width: width + 'px'}">
        <div class="grid shrink-0 px-1 py-2" :style="{minHeight: topAreaMinHeight + 'px'}">
          <div v-if="milestonesStore.mode === 'day'" ref="calendarRef">
            <BaseCalendar
              size="sm"
              header-height-class="h-panel-header"
              :days="tasksStore.days"
              :selected-date="tasksStore.activeDay"
              @select-date="tasksStore.setActiveDay"
            />
          </div>
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
