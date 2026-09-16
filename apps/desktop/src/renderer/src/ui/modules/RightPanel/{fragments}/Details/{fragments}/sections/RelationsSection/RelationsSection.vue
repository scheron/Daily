<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import TaskLinkCombobox from "@/ui/common/comboboxes/TaskLinkCombobox.vue"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import RelationRow from "./{fragments}/RelationRow.vue"
import SectionHeader from "../../SectionHeader.vue"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Task, TaskRelationSets, TaskStatus} from "@daily/protocol"

const props = defineProps<{side: keyof TaskRelationSets}>()

const taskEditorStore = useTaskEditorStore()
const tasksStore = useTasksStore()
const branchesStore = useBranchesStore()

const headerIcon = computed<IconName>(() => (props.side === "blockedBy" ? "alert-triangle" : "ban"))
const headerLabel = computed(() => (props.side === "blockedBy" ? "Blocked by" : "Blocks"))

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
</script>

<template>
  <div>
    <SectionHeader :icon="headerIcon" :label="headerLabel" :count="rows.length">
      <template #action>
        <BasePopup hide-header position="end" container-class="p-0 overflow-hidden max-h-none">
          <template #trigger="{toggle}">
            <BaseButton type="button" variant="text" class="p-0 text-xs" @click.stop="toggle">
              <BaseIcon name="plus" class="size-3.5" />
              <span class="leading-none">Link task</span>
            </BaseButton>
          </template>

          <template #default="{hide}">
            <TaskLinkCombobox :task="linkTarget" :current="current" :side="side" @select="onLink" @close="hide" />
          </template>
        </BasePopup>
      </template>
    </SectionHeader>

    <div v-if="rows.length" class="flex flex-col gap-1 px-2 pt-1">
      <RelationRow v-for="row in rows" :key="row.id" :task="row" @open="onOpen(row.id)" @remove="onRemove(row.id)" />
    </div>
  </div>
</template>
