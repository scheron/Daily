<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {toDurationLabel} from "@shared/utils/date/formatters"
import {sortTags} from "@shared/utils/tags/sortTags"
import {toTaskIdHash} from "@shared/utils/tasks/toTaskIdHash"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {countMarkdownImages} from "@/utils/codemirror/wordCount"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseIcon from "@/ui/base/BaseIcon"
import BranchCombobox from "@/ui/common/comboboxes/BranchCombobox.vue"
import TagsCombobox from "@/ui/common/comboboxes/TagsCombobox.vue"
import ContextMenu from "@/ui/common/misc/ContextMenu"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import EstimationPicker from "@/ui/common/pickers/EstimationPicker.vue"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"

import DeleteMenuItem from "./{fragments}/DeleteMenuItem.vue"
import MarkdownContent from "./{fragments}/MarkdownContent.vue"
import StatusSelect from "./{fragments}/StatusSelect.vue"
import {useTaskModel} from "./model/useTaskModel"

import type {ContextMenuItem, ContextMenuSelectEvent} from "@/ui/common/misc/ContextMenu"
import type {Branch, Tag, Task, TaskStatus} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const contextMenuRef = useTemplateRef<InstanceType<typeof ContextMenu>>("contextMenu")

const {canMoveUp, canMoveDown, canMoveToTop, canMoveToBottom, ...taskModel} = useTaskModel(props)

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((t) => tagsStore.tagsMap.get(t.id)).filter(Boolean) as Tag[]))

const imageCount = computed(() => countMarkdownImages(props.task.content))
const showTime = computed(() => props.task.estimatedTime > 0)
const estimateLabel = computed(() => (showTime.value ? toDurationLabel(props.task.estimatedTime) : ""))
const spentLabel = computed(() => (showTime.value && props.task.spentTime > 0 ? toDurationLabel(props.task.spentTime) : ""))
const hasFooter = computed(() => imageCount.value > 0 || showTime.value)

const menuItems = computed<ContextMenuItem[]>(() => {
  return [
    {value: "open-editor", label: "Open editor", icon: "pencil"},
    {separator: true},
    {
      value: "status",
      label: "Status",
      icon: "circle-pulse",
      children: [
        {value: "active", label: "Active", icon: "fire", class: getStatusClass("active")},
        {value: "discarded", label: "Discarded", icon: "archive", class: getStatusClass("discarded")},
        {value: "done", label: "Done", icon: "check-check", class: getStatusClass("done")},
      ],
    },
    {value: "tags", label: "Tags", icon: "tags", children: true},
    {value: "reschedule", label: "Reschedule", icon: "calendar", children: true},
    {value: "branch", label: "Move to Project", icon: "project", children: true},
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
  const isMatch = status === props.task.status

  if (!isMatch) return ""

  if (status === "active") return "text-error hover:bg-error/10 bg-error/10"
  if (status === "discarded") return "text-warning hover:bg-warning/10 bg-warning/10 "
  if (status === "done") return "text-success hover:bg-success/10 bg-success/10 "
  return ""
}

async function onSelect(event: ContextMenuSelectEvent) {
  if (event.item.value === "open-editor") {
    const proceed = await confirmLeaveIfDirty()
    if (proceed) taskEditorStore.open(props.task.id)
  }
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
</script>

<template>
  <ContextMenu ref="contextMenuRef" :items="menuItems" @select="onSelect">
    <div
      :id="task.id"
      class="group bg-base-100 hover:shadow-accent/5 relative overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-lg"
      :class="{
        'border-success/30 hover:border-success/40': task.status === 'done',
        'border-warning/30 hover:border-warning/40': task.status === 'discarded',
        'border-base-300/50 hover:border-base-content/15': task.status === 'active',
      }"
      @click.stop="onCardClick"
    >
      <div class="relative z-10 flex w-full flex-col gap-3 px-5 py-4">
        <div class="flex w-full items-center gap-3">
          <DynamicTagsPanel :tags="tags" empty-message="No tags" size="sm" />
          <div class="ml-auto flex shrink-0 items-center gap-2" data-task-dnd-ignore="true" @click.stop>
            <span v-tooltip="{content: 'Task ID', placement: 'top'}" class="text-base-content/50 font-mono text-xs leading-none whitespace-nowrap">
              {{ toTaskIdHash(task.id) }}
            </span>
            <StatusSelect :status="task.status" @update:status="taskModel.changeStatus" />
          </div>
        </div>

        <div class="transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
          <MarkdownContent :content="task.content" minimized />
        </div>

        <div v-if="hasFooter" class="flex items-center gap-2 text-xs">
          <div v-if="imageCount > 0" class="text-base-content/70 inline-flex items-center gap-1 px-2.5 py-1">
            <BaseIcon name="image" class="size-3.5" />
            <span>{{ imageCount }}</span>
          </div>

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
      <TagsCombobox :task="task" @update="taskModel.updateTaskTags" @close="contextMenuRef?.close()" />
    </template>

    <template #child-reschedule>
      <div class="p-1">
        <BaseCalendar mode="single" :days="tasksStore.days" :selected-date="task.scheduled.date" size="sm" @select-date="taskModel.rescheduleTask" />
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
  </ContextMenu>
</template>
