<script setup lang="ts">
import {computed} from "vue"

import {TASK_COLUMNS} from "@/constants/ui"
import {useTaskRelationsStore} from "@/stores/taskRelations.store"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"
import {toTaskTitle} from "@/utils/tasks/toTaskTitle"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task, TaskRelationSets, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Pick<Task, "id" | "branchId">; current: TaskRelationSets; side: keyof TaskRelationSets}>()
const emit = defineEmits<{select: [taskId: Task["id"]]; close: []}>()

const taskRelationsStore = useTaskRelationsStore()

const candidates = computed(() => taskRelationsStore.linkCandidates({task: props.task, current: props.current, side: props.side}))

function columnFor(status: TaskStatus) {
  return TASK_COLUMNS.find((column) => column.status === status)!
}

function isResolved(status: TaskStatus) {
  return status === "done" || status === "discarded"
}

function getIconClasses(status: TaskStatus) {
  return cn("size-3.5 shrink-0", columnFor(status).titleClass)
}

function getTitleClasses(status: TaskStatus) {
  return cn("min-w-0 flex-1 truncate", isResolved(status) && "text-base-content/50")
}
</script>

<template>
  <div class="w-80">
    <BaseCombobox
      single
      :items="candidates"
      :item-key="(item) => item.id"
      :filter-by="(item) => toTaskTitle(item.content)"
      placeholder="Search tasks..."
      empty-text="No tasks to link"
      @select="emit('select', $event.id)"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <BaseIcon :name="columnFor(item.status).icon" :class="getIconClasses(item.status)" />
        <span :class="getTitleClasses(item.status)">{{ toTaskTitle(item.content) }}</span>
      </template>
    </BaseCombobox>
  </div>
</template>
