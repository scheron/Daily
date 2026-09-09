<script setup lang="ts">
import {computed} from "vue"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import MilestonePicker from "@/ui/common/pickers/MilestonePicker.vue"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"

import type {Milestone} from "@daily/protocol"

const {editingTaskId} = useTaskEditor()

const tasksStore = useTasksStore()
const milestonesStore = useMilestonesStore()

const currentMilestoneId = computed<Milestone["id"] | null>(() => {
  if (!editingTaskId.value) return null
  return tasksStore.findTaskById(editingTaskId.value)?.milestoneId ?? null
})

const milestoneName = computed(() => milestonesStore.milestones.find((m) => m.id === currentMilestoneId.value)?.name ?? "No milestone")

async function onSelect(milestoneId: Milestone["id"] | null) {
  if (!editingTaskId.value || milestoneId === currentMilestoneId.value) return
  const success = await tasksStore.updateTask(editingTaskId.value, {milestoneId})
  if (success) await milestonesStore.getMilestoneList()
}
</script>

<template>
  <MilestonePicker :selected-id="currentMilestoneId" @select="onSelect">
    <template #trigger="{toggle}">
      <BaseButton type="button" class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" @click.stop="toggle">
        <BaseIcon name="bookmark" class="size-3.5" />
        <span class="leading-none">{{ milestoneName }}</span>
      </BaseButton>
    </template>
  </MilestonePicker>
</template>
