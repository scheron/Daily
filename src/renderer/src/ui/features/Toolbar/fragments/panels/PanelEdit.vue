<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef, watch} from "vue"
import {toast} from "vue-sonner"
import {useProgressFill} from "@/composables/useProgressFill"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {oklchToHex} from "@/utils/colors"

import type {Tag} from "@/types/tasks"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/base/DynamicTagsPanel.vue"

import {useRestoreTaskToast} from "../../model/useRestoreTaskToast"

const emit = defineEmits<{close: []}>()

const tasksStore = useTasksStore()
const themeStore = useThemeStore()
const taskEditorStore = useTaskEditorStore()
const tagsStore = useTagsStore()

const toastRestoreTask = useRestoreTaskToast(async (task) => await tasksStore.restoreTask(task.id))

const selectedTags = ref<Map<Tag["id"], Tag>>(new Map())
const activeTagIds = computed(() => new Set(selectedTags.value.keys()))

const deleteBlockRef = useTemplateRef<HTMLDivElement>("deleteBlock")

const isNewTask = computed(() => taskEditorStore.currentEditingTask === null)

function onSelectTag(tagId: Tag["id"]) {
  if (selectedTags.value.has(tagId)) selectedTags.value.delete(tagId)
  else selectedTags.value.set(tagId, tagsStore.tagsMap.get(tagId)!)
}

useProgressFill(deleteBlockRef, {
  color: computed(() => `${oklchToHex(themeStore.currentTheme.colorScheme.error)}60`),
  duration: 500,
  onComplete: onDelete,
})

async function onSave() {
  const content = taskEditorStore.editorContent.trim()
  if (!content) return

  const committed = await taskEditorStore.commitAssets()
  const finalContent = taskEditorStore.replaceAttachments(content, committed)

  if (isNewTask.value) {
    const isSuccess = await tasksStore.createTask({
      content: finalContent,
      tags: taskEditorStore.editorTags,
    })

    if (!isSuccess) return toast.error("Failed to create task")
    else toast.success("Task created successfully")

    onClose()
  } else {
    const isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask!.id, {
      content: finalContent,
      tags: taskEditorStore.editorTags,
    })

    if (!isSuccess) return toast.error("Failed to update task")
    else toast.success("Task updated successfully")

    onClose()
  }
}

async function onDelete() {
  if (!taskEditorStore.currentEditingTask) return

  await tasksStore.deleteTask(taskEditorStore.currentEditingTask.id)
  toastRestoreTask(taskEditorStore.currentEditingTask)

  onClose()
}

function onClose() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setEditorTags([])
  taskEditorStore.rollbackAssets()
  taskEditorStore.setIsTaskEditorOpen(false)

  emit("close")
}

onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    selectedTags.value = new Map(taskEditorStore.currentEditingTask.tags.map((tag) => [tag.id, tag]))
  }
})
watch(
  selectedTags,
  (tags) => {
    taskEditorStore.setEditorTags(Array.from(tags.values()))
  },
  {deep: true, immediate: true},
)
</script>

<template>
  <div class="bg-base-100 flex size-full flex-col gap-3 px-4 py-2 md:flex-row md:items-center md:justify-between">
    <div class="relative flex w-full flex-1 items-center gap-2">
      <DynamicTagsPanel :tags="tagsStore.tags" :selected-tags="activeTagIds" empty-message="No daily tags" @select="onSelectTag" />
    </div>

    <div class="flex w-full shrink-0 items-center gap-3 md:w-auto">
      <div
        v-if="taskEditorStore.currentEditingTask"
        ref="deleteBlock"
        class="bg-error/20 hover:bg-error/40 text-error flex w-full items-center justify-center gap-2 rounded-sm px-2 py-1 transition-colors duration-200 md:w-fit"
      >
        <BaseIcon name="x-mark" class="relative size-4 transition-transform group-hover:scale-110" />
        <span class="text-sm font-medium">Hold to delete</span>
      </div>

      <BaseButton
        size="sm"
        icon-class="size-4"
        icon="undo"
        class="text-base-content bg-base-content/10 hover:bg-base-content/20 w-full rounded-sm px-2 py-0.5 md:w-auto"
        @click="onClose"
      >
        <span class="text-sm">Cancel {{ isNewTask ? "Create" : "Update" }}</span>
      </BaseButton>

      <BaseButton
        class="bg-success/20 hover:bg-success/30 text-success w-full rounded-sm px-5 py-0.5 md:w-auto"
        size="sm"
        icon="check"
        icon-class="size-4"
        @click="onSave"
      >
        <span class="text-sm">{{ isNewTask ? "Create New" : "Update Task" }}</span>
      </BaseButton>
    </div>
  </div>
</template>
