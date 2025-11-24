<script setup lang="ts">
import {useTemplateRef, watch} from "vue"
import {toast} from "vue-sonner"
import {until} from "@vueuse/core"
import {useMarkdown} from "@/composables/useMarkdown"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {ISODate} from "@shared/types/common"

import type {Tag, Task, TaskStatus} from "@shared/types/storage"

import DynamicTagsPanel from "@/ui/common/panels/DynamicTagsPanel.vue"

import QuickActions from "./fragments/QuickActions.vue"
import StatusButtons from "./fragments/StatusButtons.vue"
import TimerButton from "./fragments/TimerButton.vue"
import {useRestoreTaskToast} from "./model/useRestoreTaskToast"

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {tags: () => []})

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()

const toastRestoreTask = useRestoreTaskToast(async (task) => await tasksStore.restoreTask(task.id))
const contentRef = useTemplateRef<HTMLElement>("content")
const {renderMarkdown} = useMarkdown()

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
  toastRestoreTask(props.task)
}

function onOpenTimer() {
  window.BridgeIPC["timer:open"](props.task.id)
}

async function onMoveDate(targetDate: ISODate) {
  if (!props.task || !targetDate) return
  if (targetDate === props.task.scheduled.date) return

  const isMoved = await tasksStore.moveTask(props.task.id, targetDate)

  if (isMoved) toast.success("Task moved successfully")
  else toast.error("Failed to move task")
}

watch(
  () => props.task.content,
  async () => {
    await until(contentRef).toBeTruthy()

    if (contentRef.value) {
      contentRef.value.innerHTML = renderMarkdown(props.task.content)
    }
  },
  {immediate: true},
)
</script>

<template>
  <div
    class="group bg-base-100 hover:shadow-accent/5 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
    :class="{
      'border-success/30 hover:border-success/40': task.status === 'done',
      'border-warning/30 hover:border-warning/40': task.status === 'discarded',
      'border-base-300 hover:border-base-content/20': task.status === 'active',
    }"
  >
    <div
      class="absolute top-0 left-0 z-30 h-0 w-1 rounded-l-sm opacity-0 transition-all duration-500"
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
          <TimerButton :task="task" @open-timer="onOpenTimer" />
          <StatusButtons :status="task.status" @change-status="onChangeStatus" />
        </div>
      </div>

      <div class="mb-5 transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
        <div ref="content" class="markdown prose prose-sm wrap-break-words max-w-none leading-relaxed transition-all duration-200" />
      </div>
    </div>
  </div>
</template>
