import {computed, onScopeDispose, ref, watch} from "vue"
import {DateTime} from "luxon"

import {useBranchesStore} from "@/stores/branches.store"
import {useStorageStore} from "@/stores/storage.store"
import {useTasksStore} from "@/stores/tasks"

import {API} from "@/api"

import type {StatsAggregate, StatsPeriod} from "@shared/types/stats"

const EMPTY: StatsAggregate = {
  resolution: {active: 0, done: 0, discarded: 0, total: 0, resolvedPct: 0},
  completedTotal: 0,
  tags: [],
  untaggedCount: 0,
  weekday: new Array(7).fill(0),
  hours: new Array(24).fill(0),
  peakWeekday: null,
  peakHour: null,
  topTag: null,
}

/** Reactive stats aggregate for the active day's week/month, with a period toggle. */
export function useStats() {
  const tasksStore = useTasksStore()
  const branchesStore = useBranchesStore()
  const storageStore = useStorageStore()

  const period = ref<StatsPeriod>("month")
  const stats = ref<StatsAggregate>(EMPTY)

  const periodKey = computed(() => {
    const anchor = tasksStore.activeDay
    return period.value === "month" ? anchor.slice(0, 7) : DateTime.fromISO(anchor).startOf("week").toISODate()!
  })

  async function revalidate(): Promise<void> {
    stats.value = await API.getStats(period.value, tasksStore.activeDay)
  }

  watch([periodKey, () => branchesStore.activeBranchId], revalidate, {immediate: true})
  const {off} = storageStore.onStorageDataChanged(revalidate)
  onScopeDispose(off)

  return {stats, period}
}
