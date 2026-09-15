<script setup lang="ts">
import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {milestoneCompletion, sortMilestones} from "@daily/protocol"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"

import type {MilestoneWithProgress} from "@/stores/milestones.store"
import type {Milestone, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{update: [milestoneId: Milestone["id"] | null]; close: []}>()

const milestonesStore = useMilestonesStore()

const query = ref("")

const sortedMilestones = computed(() => sortMilestones(milestonesStore.milestonesForBranch(props.task.branchId)))

function isSelected(milestone: MilestoneWithProgress): boolean {
  return props.task.milestoneId === milestone.id
}

function selectMilestone(milestone: MilestoneWithProgress) {
  emit("update", isSelected(milestone) ? null : milestone.id)
}

async function createMilestone() {
  const name = query.value.trim()
  if (!name) return

  const created = await milestonesStore.createMilestone(name, null, props.task.branchId)
  if (!created) {
    toasts.error("Failed to create milestone")
    return
  }

  emit("update", created.id)
  emit("close")
}
</script>

<template>
  <div class="w-70">
    <BaseCombobox
      single
      :items="sortedMilestones"
      :item-key="(milestone) => milestone.id"
      :filter-by="(milestone) => milestone.name"
      placeholder="Search or create milestone..."
      empty-text="No milestones found"
      @update:query="query = $event"
      @select="selectMilestone"
      @select-footer="createMilestone"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <MilestoneDiamond :completion="milestoneCompletion(item.progress)" :size="12" />
        <span class="flex-1 truncate">{{ item.name }}</span>
      </template>

      <template #footer="{query: createName}">
        <BaseIcon name="plus" class="text-base-content/60 size-4 shrink-0" />
        <span class="truncate"
          >Create <span class="font-medium">"{{ createName }}"</span></span
        >
      </template>
    </BaseCombobox>
  </div>
</template>
