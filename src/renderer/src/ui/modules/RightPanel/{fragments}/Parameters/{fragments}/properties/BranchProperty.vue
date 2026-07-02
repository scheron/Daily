<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"

import type {Branch, Task} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const branchesStore = useBranchesStore()
const taskEditorStore = useTaskEditorStore()

const branchName = computed(() => branchesStore.branches.find((b) => b.id === props.task.branchId)?.name ?? "Main")

function onSelect(branch: Branch) {
  if (branch.id !== props.task.branchId) taskEditorStore.patch({branchId: branch.id})
}
</script>

<template>
  <BranchPicker :selected-id="task.branchId" @select="onSelect">
    <template #trigger="{toggle}">
      <BaseButton type="button" class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" @click.stop="toggle">
        <BaseIcon name="project" class="size-3.5" />
        <span class="leading-none">{{ branchName }}</span>
      </BaseButton>
    </template>
  </BranchPicker>
</template>
