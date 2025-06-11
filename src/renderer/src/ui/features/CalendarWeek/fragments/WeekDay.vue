<script setup lang="ts">
import {toDay, toDayLabel} from "@/utils/date"
import {cn} from "@/utils/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import type {ISODate} from "@/types/date"
import type {Day} from "@/types/tasks"

const props = defineProps<{
  date: ISODate
  day: Day | null
  currentMonth: boolean
  selected: boolean
  today: boolean
}>()
const emit = defineEmits<{"select-date": [ISODate]}>()

function selectDate() {
  emit("select-date", props.date)
}
</script>

<template>
  <div
    :class="
      cn(
        'border-base-300 relative mb-2 flex flex-col items-center justify-center rounded-lg border transition-colors duration-200 outline-none select-none last:mb-0',
        selected ? 'border-accent bg-accent/10' : today ? 'bg-primary/10' : 'hover:bg-base-300/60',
        !currentMonth ? 'opacity-60' : '',
        'px-0 py-2',
      )
    "
    tabindex="0"
    @click="selectDate"
    @keydown.enter="selectDate"
  >
    <div
      class="bg-accent absolute top-0 left-0 z-30 w-2 rounded-l-sm transition-all duration-500"
      :class="[today ? 'h-full opacity-100' : 'h-0 opacity-0']"
    />

    <div v-if="day && day?.tasks.length" class="absolute right-1 bottom-1 z-10 flex flex-col items-end">
      <div
        class="rounded-md text-[10px] relative border font-semibold flex items-center gap-1"
        :class="[day.countActive === 0 ? 'border-success text-success' : 'border-warning text-warning']"
      >
        <BaseIcon v-if="day.countActive === 0" name="check" class="size-4 p-0.5" />
        <span v-else class="px-1.5 py-0.5">{{ day.countActive > 9 ? "9+" : day.countActive }}</span>
      </div>
    </div>

    <span class="text-base-content/60 text-xs font-semibold">{{ toDayLabel(date, {short: true}) }}</span>
    <span class="flex items-center justify-center text-lg font-bold">
      {{ toDay(date) }}
    </span>
  </div>
</template>
