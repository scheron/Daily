<script setup lang="ts">
import {computed} from "vue"

import {isMilestoneOverdue, milestoneCompletion} from "@daily/protocol"
import {getToday} from "@daily/std"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import MilestoneCombobox from "@/ui/common/comboboxes/MilestoneCombobox.vue"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"
import PropertyCell from "../PropertyCell.vue"

import type {Milestone, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const milestonesStore = useMilestonesStore()
const taskEditorStore = useTaskEditorStore()

const milestone = computed(() => (props.task.milestoneId ? (milestonesStore.milestonesMap.get(props.task.milestoneId) ?? null) : null))
const milestoneName = computed(() => milestone.value?.name ?? "Set milestone")
const completion = computed(() => (milestone.value ? milestoneCompletion(milestone.value.progress) : 0))
const overdue = computed(() => (milestone.value ? isMilestoneOverdue(milestone.value, milestone.value.progress, getToday()) : false))

function onSelect(milestoneId: Milestone["id"] | null) {
  taskEditorStore.patch({milestoneId})
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <PropertyCell :label="milestoneName" :is-empty="!milestone" @click="toggle">
        <template #icon>
          <MilestoneDiamond v-if="milestone" :completion="completion" :overdue="overdue" :size="16" />
          <BaseIcon v-else name="milestone" class="size-4" />
        </template>
      </PropertyCell>
    </template>

    <template #default="{hide}">
      <MilestoneCombobox :task="task" @update="onSelect" @close="hide" />
    </template>
  </BasePopup>
</template>
