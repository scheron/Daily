<script setup lang="ts">
import {reactive} from "vue"
import {toasts} from "vue-toasts-lite"

import {ISODate} from "@shared/types/common"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"

import {useTaskEditorStore} from "@MainView/stores/taskEditor.store"
import {useCopyTaskToClipboard} from "./composables/useCopyTaskToClipboard"
import QuickActions from "./{fragments}/QuickActions.vue"
import StatusButtons from "./{fragments}/StatusButtons.vue"
import TaskContextMenu from "./{fragments}/TaskContextMenu.vue"
import TimeTrackingButton from "./{fragments}/TimeTrackingButton.vue"

import type {Tag, Task, TaskStatus} from "@shared/types/storage"

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {tags: () => []})

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const {copyTaskToClipboard} = useCopyTaskToClipboard()
const contextMenuState = reactive({
  isOpen: false,
  x: 0,
  y: 0,
})

function onChangeStatus(status: TaskStatus) {
  if (props.task.status === status) return
  tasksStore.updateTask(props.task.id, {status})
}

function onEdit() {
  taskEditorStore.setCurrentEditingTask(props.task ?? null)
  taskEditorStore.setEditorTags(props.task?.tags ?? [])
  taskEditorStore.setIsTaskEditorOpen(true)
}

function onOpenContextMenu(event: MouseEvent) {
  contextMenuState.x = event.clientX
  contextMenuState.y = event.clientY
  contextMenuState.isOpen = true
}

function onSetContextMenuOpen(isOpen: boolean) {
  contextMenuState.isOpen = isOpen
}

async function onDelete() {
  if (!props.task) return
  await tasksStore.deleteTask(props.task.id)
  toasts.success("Task deleted")
}

async function onMoveDate(targetDate: ISODate) {
  if (!props.task || !targetDate) return
  if (targetDate === props.task.scheduled.date) return

  const isMoved = await tasksStore.moveTask(props.task.id, targetDate)

  if (isMoved) toasts.success("Task moved successfully")
  else toasts.error("Failed to move task")
}

async function onCopyTask() {
  if (!props.task) return

  const copied = await copyTaskToClipboard(props.task, props.tags)
  if (copied) toasts.success("Task copied to clipboard")
  else toasts.error("Failed to copy task")
}

async function onToggleTag(tag: Tag) {
  const currentTags = props.task.tags
  const hasTag = currentTags.some((currentTag) => currentTag.id === tag.id)
  const nextTags = hasTag ? currentTags.filter((currentTag) => currentTag.id !== tag.id) : [...currentTags, tag]

  const isUpdated = await tasksStore.updateTask(props.task.id, {tags: nextTags})
  if (!isUpdated) toasts.error("Failed to update tags")
}
</script>

<template>
  <div
    :id="task.id"
    class="group min-h-card bg-base-100 hover:shadow-accent/5 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
    :class="{
      'border-success/30 hover:border-success/40': task.status === 'done',
      'border-warning/30 hover:border-warning/40': task.status === 'discarded',
      'border-base-300 hover:border-base-content/20': task.status === 'active',
    }"
    @contextmenu.prevent="onOpenContextMenu"
  >
    <div
      class="absolute top-0 left-0 z-30 h-0 w-1 rounded-l-sm opacity-0 transition-all duration-500"
      aria-label="Task status indicator"
      :class="{
        'bg-warning/30 h-full opacity-100': task.status === 'discarded',
        'bg-success/30 h-full opacity-100': task.status === 'done',
      }"
    />

    <div class="relative z-10 w-full px-5 pt-3 pb-1">
      <div class="mb-3 flex w-full items-center justify-between gap-3">
        <DynamicTagsPanel :tags="tags" empty-message="No tags" />
        <div class="flex shrink-0 items-center gap-2">
          <QuickActions @move-date="onMoveDate" @edit="onEdit" @delete="onDelete" @copy-task="onCopyTask" />
          <TimeTrackingButton :task="task" />
          <StatusButtons :status="task.status" @update:status="onChangeStatus" />
        </div>
      </div>

      <div class="mb-5 transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
        <MarkdownContent :content="task.content" />
      </div>
    </div>

    <TaskContextMenu
      :open="contextMenuState.isOpen"
      :position="{x: contextMenuState.x, y: contextMenuState.y}"
      :task-status="task.status"
      :task-tags="task.tags"
      :available-tags="tagsStore.tags"
      @update:open="onSetContextMenuOpen"
      @edit="onEdit"
      @move-date="onMoveDate"
      @status-change="onChangeStatus"
      @copy="onCopyTask"
      @toggle-tag="onToggleTag"
    />
  </div>
</template>
