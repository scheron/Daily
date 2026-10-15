<script setup lang="ts">
import {computed} from "vue"

import {NO_PROJECT_ID} from "@daily/protocol"

import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"
import PropertyCell from "../PropertyCell.vue"

import type {Branch, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const branchesStore = useBranchesStore()
const taskEditorStore = useTaskEditorStore()

const branch = computed(() => (props.task.branchId === NO_PROJECT_ID ? null : (branchesStore.branchesMap.get(props.task.branchId) ?? null)))
const branchName = computed(() => branch.value?.name ?? "Set project")

function onSelect(branch: Branch) {
  if (branch.id !== props.task.branchId) taskEditorStore.patch({branchId: branch.id})
}

function onRemove() {
  taskEditorStore.patch({branchId: NO_PROJECT_ID})
}
</script>

<template>
  <BranchPicker :selected-id="task.branchId" hides-no-project @select="onSelect">
    <template #trigger="{toggle}">
      <PropertyCell :label="branchName" :is-empty="!branch" :removable="Boolean(branch)" @click="toggle" @remove="onRemove">
        <template #icon>
          <BaseIcon name="project" class="size-4" />
        </template>
      </PropertyCell>
    </template>
  </BranchPicker>
</template>
