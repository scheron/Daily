<script setup lang="ts">
import {computed} from "vue"

import {isMilestoneClosed, isMilestoneOverdue, milestoneCompletion, sortMilestones} from "@daily/protocol"
import {getToday, toDateLabel} from "@daily/std"

import {useBranchesStore} from "@/stores/branches.store"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useUIStore} from "@/stores/ui/ui.store"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"

import type {MilestoneWithProgress} from "@/stores/milestones.store"
import type {Milestone, MilestoneProgress} from "@daily/protocol"

const branchesStore = useBranchesStore()
const milestonesStore = useMilestonesStore()
const filterStore = useFilterStore()
const uiStore = useUIStore()
const dragDropStore = useDragDropStore()

const sortedMilestones = computed(() =>
  branchesStore.activeBranchId ? sortMilestones(milestonesStore.milestonesForBranch(branchesStore.activeBranchId)) : [],
)
const firstClosedIndex = computed(() => sortedMilestones.value.findIndex((milestone) => isMilestoneClosed(milestone.progress)))
const openMilestones = computed(() =>
  firstClosedIndex.value === -1 ? sortedMilestones.value : sortedMilestones.value.slice(0, firstClosedIndex.value),
)
const closedMilestones = computed(() => (firstClosedIndex.value === -1 ? [] : sortedMilestones.value.slice(firstClosedIndex.value)))

function completionOf(progress: MilestoneProgress) {
  return milestoneCompletion(progress)
}

function overdueOf(milestone: MilestoneWithProgress) {
  return isMilestoneOverdue(milestone, milestone.progress, getToday())
}

function dateLabelOf(milestone: MilestoneWithProgress) {
  return milestone.targetDate ? toDateLabel(milestone.targetDate, {short: true}) : ""
}

function percentLabelOf(progress: MilestoneProgress) {
  return `${Math.round(milestoneCompletion(progress) * 100)}%`
}

function onSelect(id: Milestone["id"]) {
  filterStore.setActiveMilestone(id)
  uiStore.toggleCalendarDock(false)
}

function isDropTarget(id: Milestone["id"]) {
  return dragDropStore.dropTargetMilestoneId === id
}

function isSelected(id: Milestone["id"]) {
  return filterStore.activeMilestoneId === id
}
</script>

<template>
  <div class="flex flex-col gap-0.5 p-1 pt-2">
    <p v-if="!sortedMilestones.length" class="text-base-content/40 px-2 py-3 text-xs">No milestones yet</p>

    <template v-else>
      <div
        v-for="milestone in openMilestones"
        :key="milestone.id"
        :data-drop-milestone="milestone.id"
        class="hover:bg-base-200/60 flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors"
        :class="[{'ring-accent border-accent ring-1': isDropTarget(milestone.id)}, {'bg-accent/12 text-accent': isSelected(milestone.id)}]"
        @click="onSelect(milestone.id)"
      >
        <MilestoneDiamond :completion="completionOf(milestone.progress)" :overdue="overdueOf(milestone)" :size="13" />
        <span class="min-w-0 flex-1 truncate font-medium">{{ milestone.name }}</span>
        <div class="text-base-content/55 flex shrink-0 items-center gap-2 text-xs">
          <span class="shrink-0 text-right whitespace-nowrap">{{ dateLabelOf(milestone) }}</span>
          <span class="w-14 shrink-0 text-right tabular-nums">{{ milestone.progress.total }} tasks</span>
          <span class="w-9 shrink-0 text-right tabular-nums">{{ percentLabelOf(milestone.progress) }}</span>
        </div>
      </div>

      <template v-if="closedMilestones.length">
        <div class="text-base-content/45 px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">
          Closed · {{ closedMilestones.length }}
        </div>

        <div
          v-for="milestone in closedMilestones"
          :key="milestone.id"
          :data-drop-milestone="milestone.id"
          class="hover:bg-base-200/60 flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm opacity-50 transition-colors"
          :class="[{'ring-accent border-accent ring-1': isDropTarget(milestone.id)}, {'bg-accent/12 text-accent': isSelected(milestone.id)}]"
          @click="onSelect(milestone.id)"
        >
          <MilestoneDiamond :completion="completionOf(milestone.progress)" :overdue="overdueOf(milestone)" :size="13" />
          <span class="min-w-0 flex-1 truncate font-medium">{{ milestone.name }}</span>
          <div class="text-base-content/55 flex shrink-0 items-center gap-2 text-xs">
            <span class="shrink-0 text-right whitespace-nowrap">{{ dateLabelOf(milestone) }}</span>
            <span class="w-14 shrink-0 text-right tabular-nums">{{ milestone.progress.total }} tasks</span>
            <span class="w-9 shrink-0 text-right tabular-nums">{{ percentLabelOf(milestone.progress) }}</span>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
