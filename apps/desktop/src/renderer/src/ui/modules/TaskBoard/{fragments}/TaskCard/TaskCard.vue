<script setup lang="ts">
import {computed, toRef, useTemplateRef} from "vue"

import {sortTags} from "@daily/protocol"
import {toDateLabel} from "@daily/std"

import {useBoardCardGeometry} from "@/composables/useBoardCardGeometry"
import {useBranchesStore} from "@/stores/branches.store"
import {useFilterStore} from "@/stores/filter.store"
import {useFocusStore} from "@/stores/focus.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useProjectScopeStore} from "@/stores/projectScope.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskCommentsStore} from "@/stores/taskComments.store"
import {useTaskRelationsStore} from "@/stores/taskRelations.store"
import {useTasksStore} from "@/stores/tasks"
import BaseContextMenu from "@/ui/base/BaseContextMenu"
import BaseIcon from "@/ui/base/BaseIcon"
import TaskCalendar from "@/ui/common/calendar/TaskCalendar"
import BranchCombobox from "@/ui/common/comboboxes/BranchCombobox.vue"
import MilestoneCombobox from "@/ui/common/comboboxes/MilestoneCombobox.vue"
import PriorityCombobox from "@/ui/common/comboboxes/PriorityCombobox.vue"
import TagsCombobox from "@/ui/common/comboboxes/TagsCombobox.vue"
import TaskLinkCombobox from "@/ui/common/comboboxes/TaskLinkCombobox.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import EstimationPicker from "@/ui/common/pickers/EstimationPicker"
import PriorityIcon from "@/ui/common/priority/PriorityIcon.vue"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {toShortDurationLabel} from "@/utils/date/toShortDurationLabel"
import {cn} from "@/utils/ui/tailwindcss"
import {toTaskTitle} from "@shared/utils/tasks/toTaskTitle"
import CardCrumb from "./{fragments}/CardCrumb.vue"
import DeleteMenuItem from "./{fragments}/DeleteMenuItem.vue"
import FocusBorder from "./{fragments}/FocusBorder.vue"
import RelationChip from "./{fragments}/RelationChip.vue"
import TagLine from "./{fragments}/TagLine.vue"
import {useTaskModel} from "./useTaskModel"

import type {BaseContextMenuItem, BaseContextMenuSelectEvent} from "@/ui/base/BaseContextMenu"
import type {Branch, Tag, Task, TaskRelationSets, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const {isCompact, cardHeight} = useBoardCardGeometry()
const title = computed(() => toTaskTitle(props.task.content) || "Untitled task")

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const taskRelationsStore = useTaskRelationsStore()
const taskCommentsStore = useTaskCommentsStore()
const milestonesStore = useMilestonesStore()
const filterStore = useFilterStore()
const focusStore = useFocusStore()
const branchesStore = useBranchesStore()
const projectScopeStore = useProjectScopeStore()

const contextMenuRef = useTemplateRef<InstanceType<typeof BaseContextMenu>>("contextMenu")

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((t) => tagsStore.tagsMap.get(t.id)).filter(Boolean) as Tag[]))

const milestone = computed(() => (props.task.milestoneId ? (milestonesStore.milestonesMap.get(props.task.milestoneId) ?? null) : null))
const estimateLabel = computed(() => toShortDurationLabel(props.task.estimatedTime))
const spentLabel = computed(() => toShortDurationLabel(props.task.spentTime))
const hasRelation = computed(() => taskRelationsStore.chipByTaskId.has(props.task.id))
const commentCount = computed(() => taskCommentsStore.commentCountOf(props.task.id))
const projectName = computed(() => (projectScopeStore.isAllProjectsMode ? (branchesStore.branchesMap.get(props.task.branchId)?.name ?? "") : ""))
const isInSession = computed(() => focusStore.isInSession(props.task.id))

const footerDayLabel = computed(() => {
  if (filterStore.frame !== "milestone" || !props.task.scheduled) return ""
  return toDateLabel(props.task.scheduled.date, {short: true})
})

const hasTime = computed(() => Boolean(estimateLabel.value) || Boolean(spentLabel.value))
const hasContext = computed(() => hasRelation.value || Boolean(footerDayLabel.value) || commentCount.value > 0)
const hasMetrics = computed(() => hasRelation.value || Boolean(footerDayLabel.value) || hasTime.value || commentCount.value > 0)
const hasPriority = computed(() => props.task.priority !== "none")
const hasFooter = computed(() => tags.value.length > 0 || hasMetrics.value || hasPriority.value)

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
    {value: "priority", label: "Priority", icon: "priority-high", children: true},
    {separator: true},
    {value: "time-estimate", label: "Time estimate", icon: "stopwatch", children: true},
    {
      value: "time-spent",
      label: "Time spent",
      icon: "check-check",
      children: true,
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
  if (taskEditorStore.editingTaskId === props.task.id) return

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

function getCardClasses(status: TaskStatus, isInSession: boolean) {
  return cn(
    "bg-base-100 hover:shadow-accent/5 group relative overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200 hover:shadow-lg",
    status === "backlog" && "border-base-content/15 border-dashed",
    status === "done" && "border-success/30 hover:border-success/40",
    status === "discarded" && "border-warning/30 hover:border-warning/40",
    status === "active" && "border-error/45 hover:border-error/60",
    isInSession && "border-transparent hover:border-transparent",
  )
}

function getPriorityClasses(hasMetrics: boolean) {
  return cn("size-4 shrink-0", !hasMetrics && "ml-auto")
}

function getSpentClasses(hasSpent: boolean) {
  return cn("text-base-content/55", hasSpent && "text-base-content")
}

function getContentClasses(status: TaskStatus) {
  return cn(
    "relative min-h-0 flex-1 overflow-hidden transition-opacity duration-200",
    !isCompact.value && "board-card-text",
    (status === "done" || status === "discarded") && "opacity-50",
  )
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
    <div
      :id="task.id"
      :class="[getCardClasses(task.status, isInSession), {'board-card-compact': isCompact}]"
      :style="{height: `${cardHeight}px`}"
      @click.stop="onCardClick"
    >
      <div class="board-card-inner relative z-10 flex h-full w-full flex-col gap-2 px-4 pb-3 pt-3.5">
        <CardCrumb v-if="projectName || milestone" :project-name="projectName" :milestone="milestone" />

        <div :class="getContentClasses(task.status)">
          <p v-if="isCompact" class="board-card-title">{{ title }}</p>
          <MarkdownContent v-else :content="task.content" :minimizable="false" clip-code />
        </div>

        <div
          v-if="isCompact ? tags.length || hasTime || hasPriority : hasFooter"
          class="board-card-footer flex min-h-5 min-w-0 items-center gap-2 text-xs"
        >
          <TagLine v-if="tags.length" :tags="tags" />

          <div v-if="isCompact ? hasTime : hasMetrics" class="ml-auto flex shrink-0 items-center gap-2.5">
            <RelationChip v-if="!isCompact" :task-id="task.id" />
            <div v-if="!isCompact && footerDayLabel" class="text-base-content/75 inline-flex items-center gap-1 whitespace-nowrap">
              <BaseIcon name="calendar" class="text-base-content/40 size-3.5" />
              <span>{{ footerDayLabel }}</span>
            </div>
            <div v-if="hasTime" class="text-base-content/75 inline-flex items-center gap-1 whitespace-nowrap">
              <BaseIcon name="stopwatch" class="text-accent size-3.5" />
              <span>
                <span :class="getSpentClasses(!!spentLabel)">{{ spentLabel || "–" }}</span>
                <span class="text-base-content/55"> / {{ estimateLabel || "–" }}</span>
              </span>
            </div>
            <div v-if="!isCompact && commentCount" class="text-base-content/75 inline-flex items-center gap-1 whitespace-nowrap">
              <BaseIcon name="message" class="text-base-content/40 size-3.5" />
              <span>{{ commentCount }}</span>
            </div>
          </div>

          <PriorityIcon v-if="hasPriority" :priority="task.priority" :class="getPriorityClasses(isCompact ? hasTime : hasMetrics)" />
        </div>

        <div v-if="isCompact && hasContext" class="board-card-context flex min-h-5 shrink-0 items-center justify-end gap-2.5 text-xs">
          <RelationChip :task-id="task.id" />
          <div v-if="footerDayLabel" class="text-base-content/75 inline-flex items-center gap-1 whitespace-nowrap">
            <BaseIcon name="calendar" class="text-base-content/40 size-3.5" />
            <span>{{ footerDayLabel }}</span>
          </div>
          <div v-if="commentCount" class="text-base-content/75 inline-flex items-center gap-1 whitespace-nowrap">
            <BaseIcon name="message" class="text-base-content/40 size-3.5" />
            <span>{{ commentCount }}</span>
          </div>
        </div>
      </div>

      <FocusBorder v-if="isInSession" />
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

    <template #child-priority>
      <PriorityCombobox :priority="task.priority" @update="taskModel.updateTaskPriority" @close="contextMenuRef?.close()" />
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

<style scoped>
.board-card-compact .board-card-inner {
  padding: 0.5rem 0.8rem 0.4rem;
  gap: 0.125rem;
}

.board-card-compact .board-card-inner > :deep(.h-4.text-xs) {
  height: 0.9rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.board-card-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
}

.board-card-compact .board-card-footer {
  min-height: 1.15rem;
  flex-shrink: 0;
}

.board-card-context {
  min-height: 0.9rem;
  line-height: 1.2;
}

.board-card-text {
  scroll-timeline: --board-card-text y;
}

.board-card-text::after {
  content: "";
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--color-base-100));
  opacity: 0;
  animation: board-card-text-cut linear both;
  animation-timeline: --board-card-text;
}

@keyframes board-card-text-cut {
  from,
  to {
    opacity: 1;
  }
}
</style>
