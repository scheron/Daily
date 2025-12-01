<script setup lang="ts">
import {useTasksStore} from "@/stores/tasks.store"
import {getNextWeek, getPreviousWeek} from "@/utils/date/week"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import CalendarWeek from "./fragments/CalendarWeek"

defineProps<{
  dataLoaded: boolean
  contentHeight: number
}>()

const tasksStore = useTasksStore()

function goToPreviousWeek() {
  tasksStore.setActiveDay(getPreviousWeek(tasksStore.activeDay))
}

function goToNextWeek() {
  tasksStore.setActiveDay(getNextWeek(tasksStore.activeDay))
}
</script>

<template>
  <aside class="border-base-300 bg-base-100 w-sidebar-collapsed border-r">
    <div class="border-base-300 h-header border-b select-none" style="-webkit-app-region: drag"></div>

    <div :style="{height: contentHeight + 'px'}" class="hide-scrollbar overflow-y-auto">
      <BaseSpinner v-if="!dataLoaded" />

      <template v-else>
        <div class="text-base-content flex size-full flex-col">
          <div class="border-base-300 flex items-center justify-center gap-1 border-b px-2 py-1">
            <BaseButton variant="ghost" icon="chevron-left" size="sm" tooltip="Предыдущая неделя" @click="goToPreviousWeek()" />
            <BaseButton variant="ghost" icon="chevron-right" size="sm" tooltip="Следующая неделя" @click="goToNextWeek()" />
          </div>

          <div class="hide-scrollbar flex-1 overflow-y-auto px-1 py-4">
            <CalendarWeek />
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
