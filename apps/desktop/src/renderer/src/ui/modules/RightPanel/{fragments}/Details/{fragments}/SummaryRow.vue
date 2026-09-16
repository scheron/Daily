<script setup lang="ts">
import {computed} from "vue"

import {toDateLabel} from "@daily/std"

import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const branchesStore = useBranchesStore()
const taskEditorStore = useTaskEditorStore()

const column = computed(() => TASK_COLUMNS.find((option) => option.status === props.task.status)!)

const summaryParts = computed(() => {
  const branchName = branchesStore.branches.find((branch) => branch.id === props.task.branchId)?.name ?? "Main"
  if (!props.task.scheduled) return [branchName]
  return [toDateLabel(props.task.scheduled.date, {short: true}), branchName]
})

const hiddenCount = computed(() => {
  const draft = taskEditorStore.draft
  if (!draft) return 0

  return [
    Boolean(draft.milestoneId),
    draft.estimatedTime > 0 || draft.spentTime > 0,
    draft.tags.length > 0,
    draft.blockedBy.length > 0,
    draft.blocks.length > 0,
  ].filter(Boolean).length
})

const {toggleDetails} = useTaskEditor()

function getStatusClasses(titleClass: string) {
  return cn("flex shrink-0 items-center gap-1.5 tracking-wide uppercase", titleClass)
}
</script>

<template>
  <button
    type="button"
    class="border-base-300 focus-visible-accent hover:bg-base-content/5 flex h-11 shrink-0 items-center gap-2 border-b px-4 text-sm transition-colors"
    @click="toggleDetails"
  >
    <BaseIcon name="chevron-down" class="text-base-content/40 size-3.5 shrink-0" />

    <span :class="getStatusClasses(column.titleClass)">
      <BaseIcon :name="column.icon" class="size-3.5" />
      {{ column.label }}
    </span>

    <template v-for="part in summaryParts" :key="part">
      <span class="text-base-content/30 shrink-0">·</span>
      <span class="text-base-content/70 min-w-0 truncate">{{ part }}</span>
    </template>

    <span v-if="hiddenCount" class="bg-base-content/10 text-base-content/50 ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-xs">
      +{{ hiddenCount }}
    </span>
  </button>
</template>
