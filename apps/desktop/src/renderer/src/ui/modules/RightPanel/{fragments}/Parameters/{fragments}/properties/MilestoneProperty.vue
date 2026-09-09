<script setup lang="ts">
import {computed} from "vue"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import MilestonePicker from "@/ui/common/pickers/MilestonePicker.vue"

import type {Milestone, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const milestonesStore = useMilestonesStore()
const taskEditorStore = useTaskEditorStore()

const milestoneName = computed(() => milestonesStore.milestones.find((m) => m.id === props.task.milestoneId)?.name ?? "No milestone")

function onSelect(milestoneId: Milestone["id"] | null) {
  if (milestoneId !== props.task.milestoneId) taskEditorStore.patch({milestoneId})
}
</script>

<template>
  <MilestonePicker :selected-id="task.milestoneId" @select="onSelect">
    <template #trigger="{toggle}">
      <BaseButton type="button" class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" @click.stop="toggle">
        <BaseIcon name="bookmark" class="size-3.5" />
        <span class="leading-none">{{ milestoneName }}</span>
      </BaseButton>
    </template>
  </MilestonePicker>
</template>
