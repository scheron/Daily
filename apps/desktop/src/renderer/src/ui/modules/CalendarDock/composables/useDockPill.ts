import {computed} from "vue"
import {useNow} from "@vueuse/core"

import {isMilestoneOverdue, milestoneCompletion} from "@daily/protocol"
import {getToday, toDateLabel, toISODate} from "@daily/std"

import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"

export function useDockPill() {
  const tasksStore = useTasksStore()
  const filterStore = useFilterStore()
  const milestonesStore = useMilestonesStore()

  const now = useNow()

  const today = computed(() => toISODate(now.value))
  const dayLabel = computed(() => {
    const text = toDateLabel(tasksStore.activeDay, {year: false})
    return tasksStore.activeDay === today.value ? `Today, ${text}` : text
  })
  const framedMilestone = computed(() =>
    filterStore.activeMilestoneId ? (milestonesStore.milestonesMap.get(filterStore.activeMilestoneId) ?? null) : null,
  )
  const framedMilestoneCompletion = computed(() => (framedMilestone.value ? milestoneCompletion(framedMilestone.value.progress) : 0))
  const framedMilestoneOverdue = computed(() =>
    framedMilestone.value ? isMilestoneOverdue(framedMilestone.value, framedMilestone.value.progress, getToday()) : false,
  )

  return {
    dayLabel,
    framedMilestone,
    framedMilestoneCompletion,
    framedMilestoneOverdue,
  }
}
