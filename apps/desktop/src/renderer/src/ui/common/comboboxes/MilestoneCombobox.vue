<script setup lang="ts">
import {computed} from "vue"

import {milestoneCompletion, sortMilestones} from "@daily/protocol"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseCombobox from "@/ui/base/BaseCombobox"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"

import type {Milestone, MilestoneView, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{update: [milestoneId: Milestone["id"] | null]; close: []}>()

const milestonesStore = useMilestonesStore()

const sortedMilestones = computed(() => sortMilestones(milestonesStore.milestonesForBranch(props.task.branchId)))

function isSelected(milestone: MilestoneView): boolean {
  return props.task.milestoneId === milestone.id
}

function selectMilestone(milestone: MilestoneView) {
  emit("update", isSelected(milestone) ? null : milestone.id)
}
</script>

<template>
  <div class="w-70">
    <BaseCombobox
      single
      :items="sortedMilestones"
      :item-key="(milestone) => milestone.id"
      :filter-by="(milestone) => milestone.name"
      placeholder="Search milestones..."
      empty-text="No milestones found"
      @select="selectMilestone"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <MilestoneDiamond :completion="milestoneCompletion(item.progress)" :size="12" />
        <span class="flex-1 truncate">{{ item.name }}</span>
      </template>
    </BaseCombobox>
  </div>
</template>
