import {computed, watch} from "vue"

import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useUIStore} from "@/stores/ui"

import type {CalendarDockTab} from "@/stores/ui"

export function useDockTabs() {
  const uiStore = useUIStore()
  const filterStore = useFilterStore()
  const milestonesStore = useMilestonesStore()

  const hasMilestones = computed(() => milestonesStore.activeMilestones.length > 0)
  const dockTab = computed<CalendarDockTab>(() => (hasMilestones.value ? uiStore.calendarDockTab : "days"))
  const dockWidthClass = computed(() => {
    if (!uiStore.isCalendarDockExpanded) return ""
    return dockTab.value === "milestones" ? "w-128" : "w-90"
  })

  function selectTab(tab: CalendarDockTab) {
    uiStore.setCalendarDockTab(tab)
    filterStore.setFrame(tab === "milestones" ? "milestone" : "day")
  }

  watch(hasMilestones, (hasAny) => {
    if (hasAny) return
    if (uiStore.calendarDockTab !== "days") uiStore.setCalendarDockTab("days")
    if (filterStore.frame !== "day") filterStore.setFrame("day")
  })

  return {
    tabs: [
      {id: "days", label: "Days", icon: "calendar"},
      {id: "milestones", label: "Milestones", icon: "milestone"},
    ] as const,
    hasMilestones,
    dockTab,
    dockWidthClass,

    selectTab,
  }
}
