<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue"
import {toast} from "vue-sonner"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"

import type {Tag} from "@/types/tasks"

import BaseButton from "@/ui/base/BaseButton.vue"
import DynamicTagsPanel from "@/ui/common/panels/DynamicTagsPanel.vue"

const emit = defineEmits<{close: []}>()

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const tagsStore = useTagsStore()

const selectedTags = ref<Map<Tag["name"], Tag>>(new Map())
const activeTagNames = computed(() => new Set(selectedTags.value.keys()))

const isNewTask = computed(() => taskEditorStore.currentEditingTask === null)

function onSelectTag(tagName: Tag["name"]) {
  if (selectedTags.value.has(tagName)) selectedTags.value.delete(tagName)
  else selectedTags.value.set(tagName, tagsStore.tagsMap.get(tagName)!)
}

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

function onClose() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setEditorTags([])
  taskEditorStore.rollbackAssets()
  taskEditorStore.setIsTaskEditorOpen(false)

  emit("close")
}

onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    selectedTags.value = new Map(taskEditorStore.currentEditingTask.tags.map((tag) => [tag.name, tag]))
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
      <DynamicTagsPanel :tags="tagsStore.tags" :selected-tags="activeTagNames" empty-message="No daily tags" @select="onSelectTag" />
    </div>

    <div class="flex w-full shrink-0 items-center gap-3 md:w-auto">
      <BaseButton
        size="sm"
        icon-class="size-4"
        icon="undo"
        class="text-base-content bg-base-content/5 hover:bg-base-content/10 w-full rounded-sm px-2 py-0.5 md:w-auto"
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
