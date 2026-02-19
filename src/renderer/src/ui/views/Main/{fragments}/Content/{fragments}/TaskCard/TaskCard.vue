<script setup lang="ts">
import {reactive, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {ISODate} from "@shared/types/common"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import ContextMenu from "@/ui/common/misc/ContextMenu"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"

import {useTaskEditorStore} from "@MainView/stores/taskEditor.store"
import {useCopyTaskToClipboard} from "./composables/useCopyTaskToClipboard"
import QuickActions from "./{fragments}/QuickActions.vue"
import StatusButtons from "./{fragments}/StatusButtons.vue"
import TimeTrackingButton from "./{fragments}/TimeTrackingButton.vue"

import type {ContextMenuItem} from "@/ui/common/misc/ContextMenu"
import type {Tag, Task, TaskStatus} from "@shared/types/storage"

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {tags: () => []})

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const {copyTaskToClipboard} = useCopyTaskToClipboard()

function onChangeStatus(status: TaskStatus) {
  if (props.task.status === status) return
  tasksStore.updateTask(props.task.id, {status})
}

function onEdit() {
  taskEditorStore.setCurrentEditingTask(props.task ?? null)
  taskEditorStore.setEditorTags(props.task?.tags ?? [])
  taskEditorStore.setIsTaskEditorOpen(true)
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

// async function onCopyTask() {
//   if (!props.task) return

//   const copied = await copyTaskToClipboard(props.task, props.tags)
//   if (copied) toasts.success("Task copied to clipboard")
//   else toasts.error("Failed to copy task")
// }

// async function onToggleTag(tag: Tag) {
//   const currentTags = props.task.tags
//   const hasTag = currentTags.some((currentTag) => currentTag.id === tag.id)
//   const nextTags = hasTag ? currentTags.filter((currentTag) => currentTag.id !== tag.id) : [...currentTags, tag]

//   const isUpdated = await tasksStore.updateTask(props.task.id, {tags: nextTags})
//   if (!isUpdated) toasts.error("Failed to update tags")
// }

const menuRef = ref<InstanceType<typeof ContextMenu> | null>(null)
// так же может быть вызван извне: disposed to outside:
// menuRef.value.openAt(position: {x: number, y: number}) // может быть вызван в любом месте, а не только внутри. Опционально, так как контектное меню должно само открываться по клику правой кнопкой и определять позицию
// menuRef.value.close() // закрыть
// menuRef.value.isOpen // true/false

const menuItems: ContextMenuItem[] = [
  {value: "edit", label: "Edit", icon: "pencil"},
  {
    value: "status",
    label: "Status",
    icon: "circle-pulse",
    children: [
      {value: "active", label: "Active", icon: "fire", class: "text-error hover:bg-error/10"},
      {value: "discarded", label: "Discarded", icon: "x", class: "text-warning hover:bg-warning/10"},
      {value: "done", label: "Done", icon: "check-check", class: "text-success hover:bg-success/10"},
    ],
  },
  {value: "tags", label: "Tags", icon: "tags"},
  {value: "reschedule", label: "Reschedule", icon: "calendar", children: true},
  {separator: true},
  {value: "copy", label: "Copy", icon: "copy"},
]

function onSelect(path: ContextMenuItem[]) {
  const values = path.map((i) => i.value)
  console.log("item selected", values)
  toasts.success(`item selected: ${values.join(" → ")}`)
}

function onOpen() {
  console.log("onOpen")
}

function onClose() {
  console.log("onClose")
}
</script>

<template>
  <ContextMenu ref="menuRef" :items="menuItems" @select="onSelect" @open="onOpen" @close="onClose">
    <template #trigger="{open, close, isOpen}">
      <div
        :id="task.id"
        class="group min-h-card bg-base-100 hover:shadow-accent/5 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
        :class="{
          'border-success/30 hover:border-success/40': task.status === 'done',
          'border-warning/30 hover:border-warning/40': task.status === 'discarded',
          'border-base-300 hover:border-base-content/20': task.status === 'active',
        }"
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
              <QuickActions @move-date="onMoveDate" @edit="onEdit" @delete="onDelete" />
              <TimeTrackingButton :task="task" />
              <StatusButtons :status="task.status" @update:status="onChangeStatus" />
            </div>
          </div>

          <div class="mb-5 transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
            <MarkdownContent :content="task.content" />
          </div>
        </div>
      </div>
    </template>

    <template #child-tags>
      <div class="max-h-64 overflow-y-auto p-1">here would be tags</div>
    </template>

    <template #child-reschedule>
      <div class="p-3">here would be calendar</div>
    </template>
  </ContextMenu>
</template>
