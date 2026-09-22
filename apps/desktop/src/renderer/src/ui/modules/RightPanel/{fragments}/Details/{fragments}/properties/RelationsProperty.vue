<script setup lang="ts">
import {computed} from "vue"

import {toTaskIdHash} from "@daily/protocol"

import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import TaskLinkCombobox from "@/ui/common/comboboxes/TaskLinkCombobox.vue"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
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
</script>

<template>
  <BasePopup hide-header position="start" trigger-class="min-w-0" container-class="p-0 overflow-hidden max-h-none">
    <template #trigger="{toggle}">
      <ChipsCell :icon="cellIcon" :label="cellLabel" @open="toggle">
        <BaseButton
          v-for="row in rows"
          :key="row.id"
          :variant="columnFor(row.status).buttonVariant"
          :icon="columnFor(row.status).icon"
          size="xs"
          class="shrink-0"
          @click="onOpen(row.id)"
        >
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
        </BaseButton>
      </ChipsCell>
    </template>

    <template #default="{hide}">
      <TaskLinkCombobox :task="linkTarget" :current="current" :side="side" @select="onLink" @close="hide" />
    </template>
  </BasePopup>
</template>
