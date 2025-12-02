<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from "vue"
import {toast} from "vue-sonner"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"

import type {Tag} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TimePicker from "@/ui/common/pickers/TimePicker.vue"

import {useTaskEditorStore} from "../../../model/taskEditor.store"

const emit = defineEmits<{close: []}>()

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const tagsStore = useTagsStore()

const selectedTags = ref<Map<Tag["id"], Tag>>(new Map())

const estimated = reactive({hours: 0, minutes: 0})

const activeTagIds = computed(() => new Set(selectedTags.value.keys()))
const isNewTask = computed(() => taskEditorStore.currentEditingTask === null)

function onSelectTag(tagId: Tag["id"]) {
  if (selectedTags.value.has(tagId)) selectedTags.value.delete(tagId)
  else selectedTags.value.set(tagId, tagsStore.tagsMap.get(tagId)!)
}

async function onSave() {
  const content = taskEditorStore.editorContent.trim()
  if (!content) return

  if (isNewTask.value) {
    const isSuccess = await tasksStore.createTask({
      content,
      tags: taskEditorStore.editorTags,
      estimatedTime: estimated.hours * 3600 + estimated.minutes * 60,
    })

    if (!isSuccess) return toast.error("Failed to create task")
    else toast.success("Task created successfully")

    onClose()
  } else {
    const isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask!.id, {
      content,
      tags: taskEditorStore.editorTags,
      status: "active",
      estimatedTime: estimated.hours * 3600 + estimated.minutes * 60,
    })

    if (!isSuccess) return toast.error("Failed to update task")
    else toast.success("Task updated successfully")

    onClose()
  }
}

function onClose() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setEditorTags([])
  taskEditorStore.setIsTaskEditorOpen(false)

  emit("close")
}

onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    selectedTags.value = new Map(taskEditorStore.currentEditingTask.tags.map((tag) => [tag.id, tag]))
    estimated.hours = Math.floor(taskEditorStore.currentEditingTask.estimatedTime / 3600)
    estimated.minutes = Math.floor((taskEditorStore.currentEditingTask.estimatedTime % 3600) / 60)
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
      <BasePopup hide-header container-class="p-0 min-w-40" position="center" content-class="p-3">
        <template #trigger="{toggle}">
          <BaseButton variant="outline" class="border-accent/30 text-accent hover:bg-accent/10" size="sm" @click="toggle">
            <span class="px-2 text-xs">{{ estimated.hours }} h.</span>
            <BaseIcon name="stopwatch" class="size-4" />
            <span class="px-2 text-xs">{{ estimated.minutes }} min.</span>
          </BaseButton>
        </template>

        <div class="flex items-center justify-between gap-3 px-3">
          <TimePicker v-model:time="estimated.hours" :min="0" :max="23" inline />
          <BaseIcon name="stopwatch" class="size-5" />
          <TimePicker v-model:time="estimated.minutes" :min="0" :max="59" inline />
        </div>
      </BasePopup>

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
