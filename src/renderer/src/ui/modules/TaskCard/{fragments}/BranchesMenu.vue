<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import BaseMenu from "@/ui/base/BaseMenu.vue"

import type {ContextMenuItem} from "@/ui/common/misc/ContextMenu"
import type {Branch, Task} from "@shared/types/storage"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{move: [branchId: Branch["id"]]}>()

const branchesStore = useBranchesStore()

const menuItems = computed<ContextMenuItem[]>(() => {
  return branchesStore.orderedBranches.map((branch) => ({
    value: branch.id,
    label: branch.name,
    icon: "project",
    disabled: props.task.branchId === branch.id,
  }))
})

async function onMoveToBranch(branchId?: Branch["id"] | null) {
  if (!branchId) return
  if (!branchesStore.branchesMap.get(branchId)) return
  emit("move", branchId)
}
</script>

<template>
  <BaseMenu :items="menuItems" class="flex flex-col gap-1.5" @select="onMoveToBranch" />
</template>
