<script setup lang="ts">
import {computed} from "vue"
import {DateTime} from "luxon"

import {ISODate} from "@shared/types/common"
import {toFullDate} from "@shared/utils/date/formatters"
import {getWeekDays} from "@shared/utils/date/getWeekDays"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"

const props = defineProps<{activeDay: string}>()

const tasksStore = useTasksStore()

const week = computed(() => getWeekDays(tasksStore.days, tasksStore.activeDay))

function goToPreviousWeek() {
  tasksStore.setActiveDay(getWeekNavigationDate(-1))
}

function goToNextWeek() {
  tasksStore.setActiveDay(getWeekNavigationDate(1))
}

function getWeekNavigationDate(offset: -1 | 1): ISODate {
  const now = DateTime.now()
  const today = now.toISODate()!
  const targetWeekStart = DateTime.fromISO(tasksStore.activeDay).plus({weeks: offset}).startOf("week")

  if (targetWeekStart.hasSame(now.startOf("week"), "day")) return today

  return targetWeekStart.toISODate()!
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
        <DayPicker
          title="Select day"
          :days="tasksStore.days"
          :active-day="tasksStore.activeDay"
          :selected-day="tasksStore.activeDay"
          @select="tasksStore.setActiveDay"
        >
          <template #trigger="{show}">
            <BaseButton variant="ghost" icon="calendar" class="p-0.5" tooltip="Select day" @click="show()" />
          </template>
        </DayPicker>
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
