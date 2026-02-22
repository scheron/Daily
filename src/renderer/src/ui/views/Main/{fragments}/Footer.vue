<script setup lang="ts">
import {computed} from "vue"

import {toFullDate, toISODate} from "@shared/utils/date/formatters"
import {getNextWeekDate} from "@shared/utils/date/getNextWeekDate"
import {getPrevWeekDate} from "@shared/utils/date/getPrevWeekDate"
import {getWeekDays} from "@shared/utils/date/getWeekDays"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const props = defineProps<{activeDay: string}>()

const tasksStore = useTasksStore()

const week = computed(() => getWeekDays(tasksStore.days, tasksStore.activeDay))

function goToToday() {
  tasksStore.setActiveDay(toISODate(Date.now()))
}

function goToPreviousWeek() {
  tasksStore.setActiveDay(getPrevWeekDate(tasksStore.activeDay))
}

function goToNextWeek() {
  tasksStore.setActiveDay(getNextWeekDate(tasksStore.activeDay))
}

function getBadgeText(activeTasksCount: number) {
  return activeTasksCount > 9 ? "9+" : String(activeTasksCount)
}
</script>

<template>
  <div class="app-footer border-base-300 h-header border-t px-4">
    <div class="flex h-full w-full items-center justify-between gap-3">
      <div class="flex items-center justify-between gap-1">
        <BaseButton variant="ghost" icon="chevron-left" class="p-0.5" tooltip="Previous week" @click="goToPreviousWeek()" />
        <BaseButton variant="ghost" icon="today" class="p-0.5" tooltip="Today" @click="goToToday()" />
        <BaseButton variant="ghost" icon="chevron-right" class="p-0.5" tooltip="Next week" @click="goToNextWeek()" />
      </div>

      <ul class="flex w-full min-w-0 items-center justify-between gap-1">
        <li
          v-for="weekDay in week"
          :key="weekDay.date"
          class="relative flex min-w-0 flex-1 items-center justify-center rounded-lg border px-2 py-1 font-semibold transition-colors duration-150"
          :class="[
            weekDay.date === props.activeDay ? 'text-accent bg-base-100 border-accent/50' : 'bg-base-200 text-base-content/80 border-transparent',
          ]"
          @click="tasksStore.setActiveDay(weekDay.date)"
        >
          <span class="truncate text-[10px]">{{ toFullDate(weekDay.date) }}</span>

          <span
            v-if="weekDay.day?.tasks.length"
            class="ml-auto flex size-4 items-center justify-center gap-1 rounded-md"
            :class="[weekDay.day.countActive === 0 ? 'text-base-100 bg-success/50' : 'text-warning bg-warning/10']"
          >
            <BaseIcon v-if="weekDay.day.countActive === 0" name="check" class="size-4" />
            <span v-else class="text-[10px]">{{ getBadgeText(weekDay.day.countActive) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
