<script setup lang="ts">
import {computed} from "vue"

import {NO_PROJECT_ID} from "@daily/protocol"

import {useBranchesStore} from "@/stores/branches"
import {useTaskEditorStore} from "@/stores/task-editor"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"
import BranchPicker from "@/ui/common/(pickers)/BranchPicker.vue"
import {getProjectName} from "@/utils/projects/getProjectName"
import PropertyCell from "../PropertyCell.vue"

import type {Branch, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const branchesStore = useBranchesStore()
const taskEditorStore = useTaskEditorStore()

const branch = computed(() => branchesStore.branchesMap.get(props.task.branchId) ?? null)
const isEmpty = computed(() => !branch.value || branch.value.id === NO_PROJECT_ID)

function onSelect(branch: Branch) {
  if (branch.id !== props.task.branchId) taskEditorStore.patch({branchId: branch.id})
}
</script>

<template>
  <BranchPicker :selected-id="task.branchId" @select="onSelect">
    <template #trigger="{toggle}">
      <PropertyCell :label="getProjectName(branch)" :is-empty="isEmpty" @click="toggle">
        <template #icon>
          <ProjectIcon :project="branch" class="size-4" />
        </template>
      </PropertyCell>
    </template>
  </BranchPicker>
</template>
