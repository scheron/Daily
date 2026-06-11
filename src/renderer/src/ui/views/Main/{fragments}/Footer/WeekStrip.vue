<script setup lang="ts">
import {computed} from "vue"
import {useNow} from "@vueuse/core"
import {DateTime} from "luxon"

import {ISODate} from "@shared/types/common"
import {toFullDate} from "@shared/utils/date/formatters"
import {getWeekDays} from "@shared/utils/date/getWeekDays"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"

const props = defineProps<{activeDay: string; dropTargetDate: ISODate | null}>()

const tasksStore = useTasksStore()
const now = useNow()

const week = computed(() => getWeekDays(tasksStore.days, tasksStore.activeDay))
const today = computed(() => DateTime.fromJSDate(now.value).toISODate())

function getBadgeText(activeTasksCount: number) {
  return activeTasksCount > 9 ? "9+" : String(activeTasksCount)
}

function isToday(date: ISODate): boolean {
  return date === today.value
}
</script>

<template>
  <div class="flex h-full w-full min-w-0 items-center justify-between gap-3">
    <div class="flex items-center justify-between gap-1">
      <DayPicker
        hover-mode
        :days="tasksStore.days"
        :active-day="tasksStore.activeDay"
        :selected-day="tasksStore.activeDay"
        @select="tasksStore.setActiveDay"
      >
        <template #trigger="{show}">
          <BaseButton variant="ghost" icon="calendar" class="p-0.5" tooltip="Select day" @mouseenter="show" />
        </template>
      </DayPicker>
    </div>

    <ul class="flex w-full min-w-0 items-center justify-between gap-2">
      <li
        v-for="weekDay in week"
        :key="weekDay.date"
        :data-drop-day="weekDay.date"
        class="relative flex min-w-0 flex-1 items-center justify-center rounded-lg border px-2 py-1 font-semibold transition-all duration-150"
        :class="[
          props.dropTargetDate === weekDay.date
            ? 'ring-accent border-accent scale-105 ring-1'
            : weekDay.date === props.activeDay
              ? isToday(weekDay.date)
                ? 'text-accent bg-accent/15 border-accent'
                : 'text-accent bg-base-100 border-accent/50'
              : isToday(weekDay.date)
                ? 'border-accent'
                : 'bg-base-200 text-base-content/80 border-transparent',
        ]"
        @click="tasksStore.setActiveDay(weekDay.date)"
      >
        <div
          class="bg-accent absolute top-0 left-0 z-10 w-1 rounded-l-md transition-all duration-200"
          :class="[isToday(weekDay.date) ? 'h-full opacity-100' : 'h-0 opacity-0']"
        />
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
</template>
