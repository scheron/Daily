<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef} from "vue"
import {toast} from "vue-sonner"

import {oklchToHex} from "@/utils/colors"
import {useProgressFill} from "@/composables/useProgressFill"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag.vue"
import {useRestoreTaskToast} from "../../model/useRestoreTaskToast"

import type {Tag} from "@/types/tasks"

const VISIBLE_TAGS_COUNT = 3

const emit = defineEmits<{close: []}>()

const tasksStore = useTasksStore()
const themeStore = useThemeStore()
const taskEditorStore = useTaskEditorStore()
const tagsStore = useTagsStore()

const toastRestoreTask = useRestoreTaskToast(async (task) => await tasksStore.restoreTask(task.id))

const selectedTags = ref<Map<Tag["id"], Tag>>(new Map())

const isNewTask = computed(() => taskEditorStore.currentEditingTask === null)
const visibleTags = computed(() => tagsStore.tags.slice(0, VISIBLE_TAGS_COUNT))
const remainingTags = computed(() => tagsStore.tags.slice(VISIBLE_TAGS_COUNT))
const hasSelectedInPopup = computed(() => remainingTags.value.some((tag) => selectedTags.value.has(tag.id)))

function isActiveTag(tagId: Tag["id"]) {
  return selectedTags.value.has(tagId)
}

function onSelectTag(tagId: Tag["id"]) {
  if (selectedTags.value.has(tagId)) selectedTags.value.delete(tagId)
  else selectedTags.value.set(tagId, tagsStore.tagsMap.get(tagId)!)
}

const deleteBlockRef = useTemplateRef<HTMLDivElement>("deleteBlock")

useProgressFill(deleteBlockRef, {
  color: computed(() => `${oklchToHex(themeStore.currentTheme.colorScheme.error)}60`),
  duration: 500,
  onComplete: onDelete,
})

async function onSave() {
  const content = taskEditorStore.editorContent.trim()
  if (!content) return

  if (isNewTask.value) {
    const newTags = Array.from(selectedTags.value.values())
    const isSuccess = await tasksStore.createTask(content, newTags)

    if (!isSuccess) return toast.error("Failed to create task")
    else toast.success("Task created successfully")

    onClose()
  } else {
    const newTags = Array.from(selectedTags.value.values())
    const isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask!.id, {content, tags: newTags})

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
  taskEditorStore.setIsTaskDeleteConfirmOpen(false)
  taskEditorStore.setIsTaskEditorOpen(false)
  emit("close")
}

onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    selectedTags.value = new Map(taskEditorStore.currentEditingTask.tags.map((tag) => [tag.id, tag]))
  }
})
</script>

<template>
  <div class="bg-base-100 flex size-full flex-col gap-3 px-4 py-2 md:flex-row md:items-center md:justify-between">
    <div class="relative flex items-center gap-2 overflow-x-auto hide-scrollbar">
      <BasePopup v-if="remainingTags.length" title="More Tags">
        <template #trigger="{toggle}">
          <BaseButton
            variant="outline"
            size="sm"
            class="px-2 rounded-md"
            :class="[hasSelectedInPopup ? 'bg-accent/10 border-accent text-accent' : 'opacity-70 hover:opacity-90']"
            icon="tags"
            icon-class="size-3.5"
            @click="toggle"
          >
            <span class="text-xs font-medium">{{ remainingTags.length }}</span>
          </BaseButton>
        </template>

        <BaseButton
          v-for="tag in remainingTags"
          :key="tag.id"
          variant="ghost"
          size="sm"
          icon-class="size-3.5"
          class="w-full"
          :class="isActiveTag(tag.id) ? 'bg-accent/10 text-accent' : ''"
          @click="onSelectTag(tag.id)"
        >
          <span class="size-2.5 rounded-sm shrink-0" :style="{backgroundColor: tag.color}" />
          <span class="text-sm truncate">{{ tag.name }}</span>
          <BaseIcon
            name="check"
            class="size-3.5 ml-auto text-base-content shrink-0 transition-opacity duration-200"
            :class="isActiveTag(tag.id) ? 'opacity-100' : 'opacity-0'"
          />
        </BaseButton>
      </BasePopup>

      <BaseTag v-for="tag in visibleTags" :key="tag.id" :tag="tag" :active="isActiveTag(tag.id)" @click="onSelectTag(tag.id)" />
    </div>

    <div class="flex w-full shrink-0 items-center gap-3 md:w-auto">
      <div
        v-if="taskEditorStore.currentEditingTask"
        ref="deleteBlock"
        class="bg-error/20 hover:bg-error/40 text-error flex w-full md:w-fit py-1 items-center justify-center gap-2 rounded-sm px-2 transition-colors duration-200"
      >
        <BaseIcon name="x-mark" class="relative size-4 transition-transform group-hover:scale-110" />
        <span class="text-sm font-medium">Hold to delete</span>
      </div>

      <BaseButton
        size="sm"
        icon-class="size-4"
        icon="undo"
        class="text-base-content bg-base-content/10 hover:bg-base-content/20 rounded-sm px-2 py-0.5 w-full md:w-auto"
        @click="onClose"
      >
        <span class="text-sm">Cancel {{ isNewTask ? "Create" : "Update" }}</span>
      </BaseButton>

      <BaseButton
        class="bg-success/20 hover:bg-success/30 rounded-sm text-success py-0.5 px-5 w-full md:w-auto"
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
