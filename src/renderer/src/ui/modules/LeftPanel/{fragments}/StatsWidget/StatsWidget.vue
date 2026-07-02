<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import BarChart from "@/ui/common/charts/BarChart.vue"
import DonutChart from "@/ui/common/charts/DonutChart.vue"
import RingChart from "@/ui/common/charts/RingChart.vue"

import {useStats} from "./model/useStats"

import type {IconName} from "@/ui/base/BaseIcon"
import type {StatsPeriod} from "@shared/types/stats"

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const FULL_WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const PERIOD_OPTIONS: {value: StatsPeriod; label: string}[] = [
  {value: "week", label: "Week"},
  {value: "month", label: "Month"},
]

const {stats, period} = useStats()

const donutSegments = computed(() => [
  ...stats.value.tags.map((tag) => ({value: tag.count, color: tag.color as string | null})),
  ...(stats.value.untaggedCount > 0 ? [{value: stats.value.untaggedCount, color: null}] : []),
])

const weekdayItems = computed(() =>
  stats.value.weekday.map((value, i) => ({
    value,
    label: WEEKDAY_LABELS[i],
    tooltip: `${WEEKDAY_LABELS[i]} · ${value}`,
    active: i === stats.value.peakWeekday,
  })),
)

const hourItems = computed(() =>
  stats.value.hours.map((value, i) => ({
    value,
    label: String(i),
    tooltip: `${pad(i)}:00–${pad(i + 1)}:00 · ${value}`,
    active: i === stats.value.peakHour,
  })),
)

const peakParts = computed(() => {
  const parts: {icon: IconName | null; label: string; color?: string | null}[] = []
  if (stats.value.peakWeekday !== null) parts.push({icon: "calendar", label: FULL_WEEKDAY_LABELS[stats.value.peakWeekday]})
  if (stats.value.peakHour !== null) parts.push({icon: "stopwatch", label: `${pad(stats.value.peakHour)}:00–${pad(stats.value.peakHour + 1)}:00`})
  if (stats.value.topTag) parts.push({icon: null, label: `#${stats.value.topTag.name}`, color: stats.value.topTag.color})
  return parts
})

function pad(n: number): string {
  return String(n).padStart(2, "0")
}
</script>

<template>
  <div class="flex shrink-0 flex-col gap-2.5 px-3 py-2.5">
    <div class="flex items-center gap-3">
      <RingChart :value="stats.resolution.resolvedPct">{{ stats.resolution.resolvedPct }}%</RingChart>

      <DonutChart :segments="donutSegments">
        <span class="text-xs font-semibold">{{ stats.completedTotal }}</span>
        <span class="text-base-content/40 text-[9px]">done</span>
      </DonutChart>

      <BaseSegmented v-model="period" :options="PERIOD_OPTIONS" class="ml-auto shrink-0" />
    </div>

    <div>
      <p class="text-base-content/40 mb-1.5 text-[11px]">Day of week</p>
      <BarChart :items="weekdayItems" />
    </div>

    <div>
      <p class="text-base-content/40 mb-1.5 text-[11px]">Time of day</p>
      <BarChart :items="hourItems" dense />
    </div>

    <div v-if="peakParts.length" class="text-base-content/50 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span v-for="(part, i) in peakParts" :key="i" class="flex items-center gap-1" :style="part.color ? {color: part.color} : undefined">
        <BaseIcon v-if="part.icon" :name="part.icon" class="size-3.5 shrink-0" />
        {{ part.label }}
      </span>
    </div>
  </div>
</template>
