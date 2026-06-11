<script setup lang="ts">
import {computed, ref} from "vue"
import {useNow} from "@vueuse/core"
import {DateTime, Info} from "luxon"

import {toMonthYear} from "@shared/utils/date/formatters"
import {useTasksStore} from "@/stores/tasks.store"

import {buildChunkRange, CELL_SIZE, CHUNK_PADDING_X, dayOfMonth, getDayDotStatus, monthKey} from "./lattice"

import type {ISODate} from "@shared/types/common"
import type {DayDotStatus, LatticeChunk} from "./lattice"

const props = defineProps<{activeDay: ISODate; dropTargetDate: ISODate | null}>()

const tasksStore = useTasksStore()
const now = useNow()

const scrollEl = ref<HTMLElement | null>(null)
const today = computed(() => DateTime.fromJSDate(now.value).toISODate()!)
const focusMonth = ref(monthKey(DateTime.now().toISODate()!))

// Keyed by index to avoid collisions in locales where 2-letter weekday abbreviations are not unique
const weekdayLabels = Info.weekdays("short").map((label) => label.slice(0, 2))
const gridStyle = {gridTemplateColumns: `repeat(7, ${CELL_SIZE}px)`}
const chunkPaddingStyle = {paddingLeft: `${CHUNK_PADDING_X}px`, paddingRight: `${CHUNK_PADDING_X}px`}

const daysMap = computed(() => new Map(tasksStore.days.map((day) => [day.date, day])))

const chunks = computed<LatticeChunk[]>(() => {
  const range = tasksStore.loadedRange
  if (!range) return []
  return buildChunkRange(range.from, range.to)
})

function onCellClick(date: ISODate) {
  tasksStore.setActiveDay(date)
}

function dotFor(date: ISODate): DayDotStatus | null {
  return getDayDotStatus(daysMap.value.get(date))
}

function isFocusMonth(date: ISODate): boolean {
  return monthKey(date) === focusMonth.value
}

function cellClass(date: ISODate): string[] {
  const state =
    props.dropTargetDate === date
      ? "ring-accent border-accent ring-1"
      : date === props.activeDay
        ? "text-accent bg-accent/15 border-accent/50"
        : date === today.value
          ? "border-accent"
          : "border-transparent"

  return [state, isFocusMonth(date) ? "opacity-100" : "opacity-40"]
}
</script>

<template>
  <div ref="scrollEl" class="h-full overflow-x-auto overflow-y-hidden" style="overflow-anchor: none">
    <div class="flex h-full w-max">
      <section v-for="chunk in chunks" :key="chunk.index" class="flex h-full flex-col" :style="chunkPaddingStyle">
        <div
          class="text-base-content/80 truncate text-center text-[11px] font-semibold transition-opacity duration-150"
          :class="isFocusMonth(chunk.middleDate) ? 'opacity-100' : 'opacity-40'"
        >
          {{ toMonthYear(chunk.middleDate) }}
        </div>

        <div class="grid" :style="gridStyle">
          <span v-for="(label, i) in weekdayLabels" :key="i" class="text-base-content/50 text-center text-[9px]">{{ label }}</span>
        </div>

        <div v-for="(weekRow, rowIndex) in chunk.weeks" :key="`${chunk.index}-${rowIndex}`" class="grid flex-1" :style="gridStyle">
          <button
            v-for="date in weekRow"
            :key="date"
            :data-drop-day="date"
            class="flex flex-col items-center justify-center rounded-md border transition-opacity duration-150"
            :class="cellClass(date)"
            @click="onCellClick(date)"
          >
            <span class="text-[11px] font-semibold">{{ dayOfMonth(date) }}</span>
            <span class="size-1 rounded-full" :class="dotFor(date) === 'active' ? 'bg-warning' : dotFor(date) === 'done' ? 'bg-success' : ''" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
