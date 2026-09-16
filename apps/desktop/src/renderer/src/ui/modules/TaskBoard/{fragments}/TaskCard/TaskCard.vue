<script setup lang="ts">
import {computed, toRef, useTemplateRef} from "vue"

import {sortTags} from "@daily/protocol"
import {toDateLabel, toDurationLabel} from "@daily/std"

import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskRelationsStore} from "@/stores/taskRelations.store"
import {useTasksStore} from "@/stores/tasks"
import BaseContextMenu from "@/ui/base/BaseContextMenu"
import BaseIcon from "@/ui/base/BaseIcon"
import TaskCalendar from "@/ui/common/calendar/TaskCalendar"
import BranchCombobox from "@/ui/common/comboboxes/BranchCombobox.vue"
import MilestoneCombobox from "@/ui/common/comboboxes/MilestoneCombobox.vue"
import TagsCombobox from "@/ui/common/comboboxes/TagsCombobox.vue"
import TaskLinkCombobox from "@/ui/common/comboboxes/TaskLinkCombobox.vue"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import EstimationPicker from "@/ui/common/pickers/EstimationPicker"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {cn} from "@/utils/ui/tailwindcss"
import DeleteMenuItem from "./{fragments}/DeleteMenuItem.vue"
import MilestoneChip from "./{fragments}/MilestoneChip.vue"
import RelationChip from "./{fragments}/RelationChip.vue"
import StatusBadge from "./{fragments}/StatusBadge.vue"
import {useTaskModel} from "./useTaskModel"

import type {BaseContextMenuItem, BaseContextMenuSelectEvent} from "@/ui/base/BaseContextMenu"
import type {Branch, Tag, Task, TaskRelationSets, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const taskRelationsStore = useTaskRelationsStore()
const milestonesStore = useMilestonesStore()
const filterStore = useFilterStore()

const contextMenuRef = useTemplateRef<InstanceType<typeof BaseContextMenu>>("contextMenu")

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((t) => tagsStore.tagsMap.get(t.id)).filter(Boolean) as Tag[]))

const milestone = computed(() => (props.task.milestoneId ? (milestonesStore.milestonesMap.get(props.task.milestoneId) ?? null) : null))
const showTime = computed(() => props.task.estimatedTime > 0)
const estimateLabel = computed(() => (showTime.value ? toDurationLabel(props.task.estimatedTime) : ""))
const spentLabel = computed(() => (showTime.value && props.task.spentTime > 0 ? toDurationLabel(props.task.spentTime) : ""))

const footerMilestone = computed(() => (filterStore.frame === "milestone" ? null : milestone.value))
const footerDayLabel = computed(() => {
  if (filterStore.frame !== "milestone" || !props.task.scheduled) return ""
  return toDateLabel(props.task.scheduled.date, {short: true})
})

const hasFooter = computed(() => Boolean(footerMilestone.value) || Boolean(footerDayLabel.value) || showTime.value)

const currentRelations = computed<TaskRelationSets>(() => {
  const related = taskRelationsStore.relatedTasksByTaskId.get(props.task.id)
  return {
    blockedBy: (related?.blockedBy ?? []).map((task) => task.id),
    blocks: (related?.blocks ?? []).map((task) => task.id),
  }
})

const {canMoveUp, canMoveDown, canMoveToTop, canMoveToBottom, ...taskModel} = useTaskModel(toRef(props, "task"))

const menuItems = computed<BaseContextMenuItem[]>(() => {
  return [
    {
      value: "status",
      label: "Status",
      icon: "circle-pulse",
      children: [
        {value: "backlog", label: "Backlog", icon: "bookmark", class: getStatusClass("backlog")},
        {value: "active", label: "Active", icon: "fire", class: getStatusClass("active")},
        {value: "done", label: "Done", icon: "check-check", class: getStatusClass("done")},
        {value: "discarded", label: "Discarded", icon: "archive", class: getStatusClass("discarded")},
      ],
    },
    {value: "tags", label: "Tags", icon: "tags", children: true},
    {value: "reschedule", label: "Reschedule", icon: "calendar", children: true},
    {separator: true},
    {value: "branch", label: "Project", icon: "project", children: true},
    {value: "milestone", label: "Milestone", icon: "milestone", children: true},
    {separator: true},
    {value: "time-estimate", label: "Time estimate", icon: "stopwatch", children: true},
    {
      value: "time-spent",
      label: "Time spent",
      icon: "check-check",
      children: true,
      disabled: props.task.estimatedTime === 0,
    },
    {separator: true},
    {value: "blocks", label: "Blocks", icon: "ban", children: true},
    {value: "blocked-by", label: "Blocked by", icon: "alert-triangle", children: true},
    {separator: true},
    {
      value: "move",
      label: "Move",
      icon: "move",
      children: [
        {value: "move-top", label: "Move to Top", icon: "chevrons-up", disabled: !canMoveToTop.value},
        {value: "move-up", label: "Move Up", icon: "chevron-up", disabled: !canMoveUp.value},
        {value: "move-down", label: "Move Down", icon: "chevron-down", disabled: !canMoveDown.value},
        {value: "move-bottom", label: "Move to Bottom", icon: "chevrons-down", disabled: !canMoveToBottom.value},
      ],
    },
    {separator: true},
    {
      value: "copy",
      label: "Copy",
      icon: "copy",
      children: [
        {value: "copy-id", label: "Copy Task ID", icon: "copy-id"},
        {value: "copy-content", label: "Copy Task Content", icon: "copy"},
      ],
    },
    {value: "duplicate", label: "Duplicate Task", icon: "duplicate"},
    {separator: true},
    {value: "delete", label: "Delete", icon: "trash", class: "text-error hover:bg-error/10", classIcon: "text-error", classLabel: "text-error"},
  ]
})

const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

async function onCardClick() {
  const proceed = await confirmLeaveIfDirty()
  if (!proceed) return
  taskEditorStore.open(props.task.id)
}

function getStatusClass(status: TaskStatus) {
  if (status !== props.task.status) return ""

  if (status === "active") return "text-error hover:bg-error/10 bg-error/10"
  if (status === "discarded") return "text-warning hover:bg-warning/10 bg-warning/10 "
  if (status === "done") return "text-success hover:bg-success/10 bg-success/10 "
  if (status === "backlog") return "text-base-content hover:bg-base-content/10 bg-base-content/10 "
  return ""
}

function getCardClasses(status: TaskStatus) {
  return cn(
    "bg-base-100 hover:shadow-accent/5 group relative overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-lg",
    status === "backlog" && "border-base-content/15 border-dashed",
    status === "done" && "border-success/30 hover:border-success/40",
    status === "discarded" && "border-warning/30 hover:border-warning/40",
    status === "active" && "border-base-300/50 hover:border-base-content/15",
  )
}

function getContentClasses(status: TaskStatus) {
  return cn("transition-opacity duration-200", (status === "done" || status === "discarded") && "opacity-50")
}

function onSelect(event: BaseContextMenuSelectEvent) {
  if (event.item.value === "move-top") taskModel.moveToTop()
  if (event.item.value === "move-up") taskModel.moveUp()
  if (event.item.value === "move-down") taskModel.moveDown()
  if (event.item.value === "move-bottom") taskModel.moveToBottom()
  if (event.item.value === "duplicate") taskModel.duplicateTask()
  if (event.item.value === "copy-id") taskModel.copyTaskIdToClipboard()
  if (event.item.value === "copy-content") taskModel.copyTaskContentToClipboard()
  if (event.parent && event.parent.item.value === "status") taskModel.changeStatus(event.item.value as TaskStatus)
}

async function onDeleteFromMenu() {
  const isDeleted = await taskModel.deleteTask()
  if (isDeleted) contextMenuRef.value?.close()
}

async function onMoveToBranch(branch: Branch) {
  if (branch.id === props.task.branchId) return
  const moved = await taskModel.moveTaskToBranch(branch.id)
  if (moved) contextMenuRef.value?.close()
}

async function onLinkTask(side: keyof TaskRelationSets, taskId: Task["id"]) {
  await taskModel.linkTask(side, taskId)
  contextMenuRef.value?.close()
}
</script>

<template>
  <BaseContextMenu ref="contextMenu" :items="menuItems" @select="onSelect">
    <div :id="task.id" :class="getCardClasses(task.status)" @click.stop="onCardClick">
      <div class="relative z-10 flex w-full flex-col gap-3 px-5 py-4">
        <div class="flex w-full items-center gap-3">
          <DynamicTagsPanel :tags="tags" size="sm" />
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <RelationChip :task-id="task.id" />
            <StatusBadge :status="task.status" />
          </div>
        </div>

        <div :class="getContentClasses(task.status)">
          <MarkdownContent :content="task.content" />
        </div>

        <div v-if="hasFooter" class="flex items-center gap-2 text-xs">
          <MilestoneChip v-if="footerMilestone" :milestone="footerMilestone" />
          <span v-else-if="footerDayLabel" class="text-base-content/80 text-xs">{{ footerDayLabel }}</span>

          <div v-if="showTime" class="ml-auto flex items-center gap-2">
            <div class="text-base-content/80 inline-flex items-center gap-1 px-2.5 py-1">
              <BaseIcon name="stopwatch" class="text-accent size-3.5" />
              <span>{{ estimateLabel }}</span>
            </div>
            <div v-if="spentLabel" class="text-base-content/80 inline-flex items-center gap-1 px-2.5 py-1">
              <BaseIcon name="check-check" class="text-success size-3.5" />
              <span>{{ spentLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #item-delete="item">
      <DeleteMenuItem :item="item" @select="onDeleteFromMenu" />
    </template>

    <template #child-tags>
      <TagsCombobox :branch-id="task.branchId" :attached="task.tags" @update="taskModel.updateTaskTags" @close="contextMenuRef?.close()" />
    </template>

    <template #child-milestone>
      <MilestoneCombobox :task="task" @update="taskModel.updateTaskMilestone" @close="contextMenuRef?.close()" />
    </template>

    <template #child-blocked-by>
      <TaskLinkCombobox
        :task="task"
        :current="currentRelations"
        side="blockedBy"
        @select="onLinkTask('blockedBy', $event)"
        @close="contextMenuRef?.close()"
      />
    </template>

    <template #child-blocks>
      <TaskLinkCombobox
        :task="task"
        :current="currentRelations"
        side="blocks"
        @select="onLinkTask('blocks', $event)"
        @close="contextMenuRef?.close()"
      />
    </template>

    <template #child-reschedule>
      <div class="p-1">
        <TaskCalendar :days="tasksStore.days" :selected-date="task.scheduled?.date ?? null" @select-date="taskModel.rescheduleTask" />
      </div>
    </template>

    <template #child-branch>
      <BranchCombobox :selected-id="task.branchId" @select="onMoveToBranch" @close="contextMenuRef?.close()" />
    </template>

    <template #child-time-estimate>
      <EstimationPicker :model-value="task.estimatedTime" @update:model-value="(value) => tasksStore.updateTask(task.id, {estimatedTime: value})" />
    </template>

    <template #child-time-spent>
      <EstimationPicker :model-value="task.spentTime" @update:model-value="(value) => tasksStore.updateTask(task.id, {spentTime: value})" />
    </template>
  </BaseContextMenu>
</template>
