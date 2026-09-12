<script setup lang="ts">
import {computed} from "vue"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import MilestoneCombobox from "@/ui/common/comboboxes/MilestoneCombobox.vue"

import type {Milestone, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const milestonesStore = useMilestonesStore()
const taskEditorStore = useTaskEditorStore()

const milestoneName = computed(() => {
  const id = props.task.milestoneId
  return id ? (milestonesStore.milestonesMap.get(id)?.name ?? "No milestone") : "No milestone"
})

function onSelect(milestoneId: Milestone["id"] | null) {
  taskEditorStore.patch({milestoneId})
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <BaseButton type="button" class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" @click.stop="toggle">
        <BaseIcon name="milestone" class="size-3.5" />
        <span class="leading-none">{{ milestoneName }}</span>
      </BaseButton>
    </template>

    <template #default="{hide}">
      <MilestoneCombobox :task="task" @update="onSelect" @close="hide" />
    </template>
  </BasePopup>
</template>
