<script setup lang="ts">
import {computed} from "vue"

import {toTaskIdHash} from "@daily/protocol"

import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import TaskLinkCombobox from "@/ui/common/comboboxes/TaskLinkCombobox.vue"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {cn} from "@/utils/ui/tailwindcss"
import ChipsCell from "../ChipsCell.vue"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Task, TaskRelationSets, TaskStatus} from "@daily/protocol"

const props = defineProps<{side: keyof TaskRelationSets}>()

const taskEditorStore = useTaskEditorStore()
const tasksStore = useTasksStore()
const branchesStore = useBranchesStore()

const cellIcon = computed<IconName>(() => (props.side === "blockedBy" ? "alert-triangle" : "ban"))
const cellLabel = computed(() => (props.side === "blockedBy" ? "Add blocked by" : "Add blocks"))

const rows = computed<Task[]>(() => {
  const unresolvedFirst: Record<TaskStatus, number> = {active: 0, backlog: 1, done: 2, discarded: 3}
  const ids = taskEditorStore.draft?.[props.side] ?? []

  return ids
    .map((id) => tasksStore.findTaskById(id))
    .filter((task): task is Task => Boolean(task))
    .sort((left, right) => unresolvedFirst[left.status] - unresolvedFirst[right.status])
})

const linkTarget = computed<Pick<Task, "id" | "branchId">>(() => ({
  id: taskEditorStore.editingTaskId ?? "__draft__",
  branchId: taskEditorStore.draft?.branchId ?? branchesStore.activeBranchId ?? "",
}))

const current = computed<TaskRelationSets>(() => ({
  blockedBy: taskEditorStore.draft?.blockedBy ?? [],
  blocks: taskEditorStore.draft?.blocks ?? [],
}))

const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

function onLink(taskId: Task["id"]) {
  if (props.side === "blockedBy") {
    taskEditorStore.patch({blockedBy: [...current.value.blockedBy, taskId], blocks: current.value.blocks.filter((id) => id !== taskId)})
  } else {
    taskEditorStore.patch({blocks: [...current.value.blocks, taskId], blockedBy: current.value.blockedBy.filter((id) => id !== taskId)})
  }
}

function onRemove(taskId: Task["id"]) {
  if (props.side === "blockedBy") taskEditorStore.patch({blockedBy: current.value.blockedBy.filter((id) => id !== taskId)})
  else taskEditorStore.patch({blocks: current.value.blocks.filter((id) => id !== taskId)})
}

async function onOpen(taskId: Task["id"]) {
  const proceed = await confirmLeaveIfDirty()
  if (!proceed) return
  taskEditorStore.open(taskId)
}

function columnFor(status: TaskStatus) {
  return TASK_COLUMNS.find((column) => column.status === status)!
}

function getChipClasses(status: TaskStatus) {
  return cn(
    "focus-visible-accent flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pr-1.5 pl-2 text-xs transition-colors",
    status === "backlog" && "bg-base-content/5 hover:bg-base-content/10",
    status === "active" && "bg-error/10 hover:bg-error/20",
    status === "done" && "bg-success/10 hover:bg-success/20",
    status === "discarded" && "bg-warning/10 hover:bg-warning/20",
  )
}

function getChipIconClasses(status: TaskStatus) {
  return cn("size-3 shrink-0", columnFor(status).titleClass)
}
</script>

<template>
  <BasePopup hide-header position="start" trigger-class="min-w-0" container-class="p-0 overflow-hidden max-h-none">
    <template #trigger="{toggle}">
      <ChipsCell :icon="cellIcon" :label="cellLabel" @open="toggle">
        <button v-for="row in rows" :key="row.id" type="button" :class="getChipClasses(row.status)" @click="onOpen(row.id)">
          <BaseIcon :name="columnFor(row.status).icon" :class="getChipIconClasses(row.status)" />
          <span class="font-mono">{{ toTaskIdHash(row.id) }}</span>
          <span
            class="text-base-content/40 hover:text-base-content hover:bg-base-content/10 inline-flex size-3.5 cursor-pointer items-center justify-center rounded-full"
            role="button"
            tabindex="0"
            aria-label="Remove link"
            @click.stop="onRemove(row.id)"
            @keydown.enter.stop.prevent="onRemove(row.id)"
          >
            <BaseIcon name="x" class="size-3" />
          </span>
        </button>
      </ChipsCell>
    </template>

    <template #default="{hide}">
      <TaskLinkCombobox :task="linkTarget" :current="current" :side="side" @select="onLink" @close="hide" />
    </template>
  </BasePopup>
</template>
