<script setup lang="ts">
import {computed, ref} from "vue"

import {milestoneCompletion, sortMilestones} from "@daily/protocol"

import {toasts} from "@/composables/useToasts"
import {useMilestonesStore} from "@/stores/milestones"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import MilestoneIcon from "@/ui/common/(icons)/MilestoneIcon.vue"

import type {MilestoneWithProgress} from "@/stores/milestones"
import type {Milestone, Task} from "@daily/protocol"

type Row = {kind: "none"} | {kind: "milestone"; milestone: MilestoneWithProgress}

const props = defineProps<{task: Task}>()
const emit = defineEmits<{update: [milestoneId: Milestone["id"] | null]; close: []}>()

const milestonesStore = useMilestonesStore()

const query = ref("")

const sortedMilestones = computed(() => sortMilestones(milestonesStore.milestonesForBranch(props.task.branchId)))

const rows = computed<Row[]>(() => [{kind: "none"}, ...sortedMilestones.value.map((milestone): Row => ({kind: "milestone", milestone}))])

function getRowId(row: Row): Milestone["id"] | null {
  return row.kind === "none" ? null : row.milestone.id
}

function getRowLabel(row: Row): string {
  return row.kind === "none" ? "No milestone" : row.milestone.name
}

function isSelected(row: Row): boolean {
  return props.task.milestoneId === getRowId(row)
}

function selectRow(row: Row) {
  if (!isSelected(row)) emit("update", getRowId(row))
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
      :items="rows"
      :item-key="(row) => getRowId(row) ?? 'none'"
      :filter-by="getRowLabel"
      placeholder="Search or create milestone..."
      empty-text="No milestones found"
      @update:query="query = $event"
      @select="selectRow"
      @select-footer="createMilestone"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <BaseIcon v-if="item.kind === 'none'" name="milestone" class="size-3 shrink-0 opacity-50" />
        <MilestoneIcon v-else :completion="milestoneCompletion(item.milestone.progress)" :size="12" />
        <span class="flex-1 truncate">{{ getRowLabel(item) }}</span>
        <BaseIcon v-if="isSelected(item)" name="check" class="text-base-content/60 size-4 shrink-0" />
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
