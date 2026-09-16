<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"
import PropertyCell from "../PropertyCell.vue"

import type {Branch, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const branchesStore = useBranchesStore()
const taskEditorStore = useTaskEditorStore()

const branchName = computed(() => branchesStore.branches.find((branch) => branch.id === props.task.branchId)?.name ?? "Main")

function onSelect(branch: Branch) {
  if (branch.id !== props.task.branchId) taskEditorStore.patch({branchId: branch.id})
}
</script>

<template>
  <BranchPicker :selected-id="task.branchId" @select="onSelect">
    <template #trigger="{toggle}">
      <PropertyCell :label="branchName" @click="toggle">
        <template #icon>
          <BaseIcon name="project" class="size-4" />
        </template>
      </PropertyCell>
    </template>
  </BranchPicker>
</template>
