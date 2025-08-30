<script setup lang="ts">
import {computed} from "vue"
import {DateTime} from "luxon"

import {toFullDate} from "@/utils/date"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"

const tasksStore = useTasksStore()

const groupedActiveDays = computed(() => {
  const now = DateTime.now()
  const startOfThisWeek = now.startOf("week")
  const startOfLastWeek = startOfThisWeek.minus({weeks: 1})
  const endOfLastWeek = startOfThisWeek.minus({days: 1})

  const startOfThisMonth = now.startOf("month")
  const startOfLastMonth = startOfThisMonth.minus({months: 1})
  const endOfLastMonth = startOfThisMonth.minus({days: 1})

  const thisWeek: {date: string; count: number}[] = []
  const lastWeek: {date: string; count: number}[] = []
  const lastMonth: {date: string; count: number}[] = []
  const older: {date: string; count: number}[] = []

  for (const day of tasksStore.days) {
    if (!day.countActive) continue
    const dayDate = DateTime.fromISO(day.date)

    const isInThisWeek = dayDate >= startOfThisWeek && dayDate <= now
    const isInLastWeek = dayDate >= startOfLastWeek && dayDate <= endOfLastWeek
    const isInLastMonth = dayDate >= startOfLastMonth && dayDate <= endOfLastMonth
    const isOlder = dayDate < startOfLastMonth

    if (isInThisWeek) thisWeek.push({date: day.date, count: day.countActive})
    if (isInLastWeek) lastWeek.push({date: day.date, count: day.countActive})
    if (isInLastMonth) lastMonth.push({date: day.date, count: day.countActive})
    if (isOlder) older.push({date: day.date, count: day.countActive})
  }

  const sortDesc = (a: {date: string}, b: {date: string}) => b.date.localeCompare(a.date)

  return [
    {label: "this week", count: thisWeek.length, items: thisWeek.sort(sortDesc)},
    {label: "last week", count: lastWeek.length, items: lastWeek.sort(sortDesc)},
    {label: "last month", count: lastMonth.length, items: lastMonth.sort(sortDesc)},
    {label: "older", count: older.length, items: older.sort(sortDesc)},
  ]
})

const hasRecentActiveTasks = computed(() => groupedActiveDays.value.some((group) => group.count))

function selectDay(date: string) {
  tasksStore.setActiveDay(date)
}
</script>

<template>
  <div v-if="hasRecentActiveTasks" class="text-xs">
    <template v-for="group in groupedActiveDays" :key="group.label">
      <div v-if="group.count">
        <div class="text-accent flex items-center gap-1 text-xs font-bold uppercase select-none bg-base-100 p-2">
          {{ group.label }}
          <div class="text-info bg-info/30 flex size-4 items-center justify-center rounded-sm text-xs">
            {{ group.count > 9 ? "9+" : group.count }}
          </div>
        </div>

        <div class="flex flex-col gap-1 px-2">
          <template v-for="item in group.items.slice(0, 5)" :key="item.date">
            <BaseButton size="sm" class="justify-between gap-2" variant="outline" @click="selectDay(item.date)">
              <span class="text-sm">{{ toFullDate(item.date) }}</span>
              <div class="text-info bg-info/30 flex size-4 items-center justify-center rounded-sm text-xs">
                {{ item.count > 9 ? "9+" : item.count }}
              </div>
            </BaseButton>
          </template>

          <div v-if="group.items.length > 5" class="text-accent/70 bg-accent/10 flex items-center justify-center rounded px-2 py-1">
            +{{ group.items.length - 5 }} more
          </div>
        </div>
      </div>
    </template>
  </div>
  <div v-else class="text-accent/70 bg-accent/10 flex items-center justify-center rounded p-2">No recent active tasks</div>
</template>
