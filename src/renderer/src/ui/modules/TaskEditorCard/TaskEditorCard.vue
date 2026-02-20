<script setup lang="ts">
import {computed, onMounted, onUnmounted, reactive, ref, watch} from "vue"
import {toasts} from "vue-toasts-lite"

import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useClipboardPaste} from "@/composables/useClipboardPaste"
import {useCodeMirror} from "@/composables/useCodeMirror"
import {useFileDrop} from "@/composables/useFileDrop"
import {createMarkdownKeymap} from "@/utils/codemirror/commands/keymap"
import {createAutoPairsExtension} from "@/utils/codemirror/extensions/autoPairs"
import {createBlockContinuationExtension} from "@/utils/codemirror/extensions/blockContinuation"
import {createCodeBlockAutocomplete} from "@/utils/codemirror/extensions/codeBlockAutocomplete"
import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createTagsAutocompleteExtension} from "@/utils/codemirror/extensions/tagsAutocomplete"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TimePicker from "@/ui/common/pickers/TimePicker.vue"

import {indentWithTab} from "@codemirror/commands"
import {EditorView} from "@codemirror/view"
import {useImageUpload} from "./composables/useImageUpload"
import FloatingToolbar from "./{fragments}/FloatingToolbar.vue"

import type {Tag} from "@shared/types/storage"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const tagsStore = useTagsStore()

const selectedTags = ref<Map<Tag["id"], Tag>>(new Map())
const estimated = reactive({hours: 0, minutes: 0})

const initialState = ref({
  content: "",
  tagIds: new Set<string>(),
  estimatedHours: 0,
  estimatedMinutes: 0,
})

const activeTagIds = computed(() => new Set(selectedTags.value.keys()))
const isNewTask = computed(() => taskEditorStore.currentEditingTask === null)

const editorId = computed(() => {
  if (isNewTask.value) return "task-editor-new-task"
  return `task-editor-${taskEditorStore.currentEditingTask?.id}`
})

const content = computed({
  get: () => taskEditorStore.editorContent,
  set: (v) => taskEditorStore.setEditorContent(v),
})

const hasChanges = computed(() => {
  const currentTagIds = new Set(selectedTags.value.keys())
  const contentChanged = content.value.trim() !== initialState.value.content.trim()
  const tagsChanged =
    currentTagIds.size !== initialState.value.tagIds.size || Array.from(currentTagIds).some((id) => !initialState.value.tagIds.has(id))
  const estimatedChanged = estimated.hours !== initialState.value.estimatedHours || estimated.minutes !== initialState.value.estimatedMinutes

  return contentChanged || tagsChanged || estimatedChanged
})

const {uploadImageFile} = useImageUpload()

function addSelectedTag(tag: Tag) {
  if (!selectedTags.value.has(tag.id)) {
    selectedTags.value.set(tag.id, tag)
  }
}

function removeSelectedTag(tag: Tag) {
  if (selectedTags.value.has(tag.id)) {
    selectedTags.value.delete(tag.id)
  }
}

const {view, container, setContent, insertText, focus} = useCodeMirror({
  content: content.value,
  onUpdate: (newContent) => (content.value = newContent),
  extensions: [
    EditorView.lineWrapping,
    createThemeExtension(),
    createWYSIWYGExtension(),
    createCodeSyntaxExtension(),
    createCodeBlockAutocomplete(),
    createTagsAutocompleteExtension({
      getTags: () => tagsStore.tags,
      getAttachedTags: () => Array.from(selectedTags.value.values()),
      onAddTag: addSelectedTag,
      onRemoveTag: removeSelectedTag,
    }),
    createAutoPairsExtension(),
    createBlockContinuationExtension(),
  ],
  shortcuts: [
    indentWithTab,
    {
      key: "Mod-Enter",
      run: () => {
        onSaveAndClose()
        return true
      },
    },
    {
      key: "Mod-Shift-Enter",
      run: () => {
        onSaveAndContinue()
        return true
      },
    },
    {
      key: "Escape",
      run: () => {
        onCancel()
        return true
      },
    },
    ...createMarkdownKeymap(),
  ],
})

function onSelectTag(tagId: Tag["id"]) {
  if (selectedTags.value.has(tagId)) selectedTags.value.delete(tagId)
  else selectedTags.value.set(tagId, tagsStore.tagsMap.get(tagId)!)
}

async function onSave() {
  const text = content.value.trim()
  if (!text) return

  if (isNewTask.value) {
    const isSuccess = await tasksStore.createTask({
      content: text,
      tags: taskEditorStore.editorTags,
      estimatedTime: estimated.hours * 3600 + estimated.minutes * 60,
    })

    if (!isSuccess) return toasts.error("Failed to create task")
    else toasts.success("Task created successfully")

    onClose()
  } else {
    const isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask!.id, {
      content: text,
      tags: taskEditorStore.editorTags,
      status: "active",
      estimatedTime: estimated.hours * 3600 + estimated.minutes * 60,
    })

    if (!isSuccess) return toasts.error("Failed to update task")
    else toasts.success("Task updated successfully")

    onClose()
  }
}

function onSaveAndClose() {
  onSave()
}

async function onSaveAndContinue() {
  const text = content.value.trim()
  if (!text) return

  if (isNewTask.value) {
    const isSuccess = await tasksStore.createTask({
      content: text,
      tags: taskEditorStore.editorTags,
      estimatedTime: estimated.hours * 3600 + estimated.minutes * 60,
    })

    if (!isSuccess) {
      toasts.error("Failed to create task")
      return
    }
    toasts.success("Task created successfully")

    clearEditor({discardFiles: false, discardTags: false})
    taskEditorStore.setCurrentEditingTask(null)
    taskEditorStore.setEditorTags([])
    selectedTags.value.clear()
    estimated.hours = 0
    estimated.minutes = 0
    view.value?.focus()
  } else {
    const isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask!.id, {
      content: text,
      tags: taskEditorStore.editorTags,
      status: "active",
      estimatedTime: estimated.hours * 3600 + estimated.minutes * 60,
    })

    if (!isSuccess) {
      toasts.error("Failed to update task")
      return
    }
    toasts.success("Task updated successfully")

    onClose()
  }
}

function onCancel() {
  if (hasChanges.value) {
    const confirmed = window.confirm("You have unsaved changes. Are you sure you want to close the editor?")
    if (!confirmed) return
  }

  clearEditor({discardFiles: true, discardTags: true})
  taskEditorStore.setIsTaskEditorOpen(false)
}

function onClose() {
  clearEditor({discardFiles: true, discardTags: true})
  taskEditorStore.setIsTaskEditorOpen(false)
}

function clearEditor(params: {discardFiles: boolean; discardTags: boolean}) {
  const {discardTags} = params

  setContent("")
  taskEditorStore.setEditorContent("")

  if (discardTags) {
    taskEditorStore.setEditorTags([])
    selectedTags.value.clear()
  }
  if (params.discardTags) {
    taskEditorStore.setCurrentEditingTask(null)
  }
}

watch(
  () => taskEditorStore.editorContent,
  (newContent) => {
    if (newContent !== content.value) {
      setContent(newContent)
    }
  },
)

watch(
  selectedTags,
  (tags) => {
    taskEditorStore.setEditorTags(Array.from(tags.values()))
  },
  {deep: true, immediate: true},
)

onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    setContent(taskEditorStore.editorContent)
    selectedTags.value = new Map(taskEditorStore.currentEditingTask.tags.map((tag) => [tag.id, tag]))
    estimated.hours = Math.floor(taskEditorStore.currentEditingTask.estimatedTime / 3600)
    estimated.minutes = Math.floor((taskEditorStore.currentEditingTask.estimatedTime % 3600) / 60)
  }

  initialState.value = {
    content: taskEditorStore.editorContent,
    tagIds: new Set(selectedTags.value.keys()),
    estimatedHours: estimated.hours,
    estimatedMinutes: estimated.minutes,
  }

  setTimeout(focus, 100)
})

onUnmounted(() => clearEditor({discardFiles: true, discardTags: true}))

useClipboardPaste(container, {
  onImagePaste: async (file) => {
    const md = await uploadImageFile(file)
    if (md) insertText(md)
  },
})

const {isDraggingOver} = useFileDrop(container, {
  onFileDrop: async (file) => {
    const md = await uploadImageFile(file)
    if (md) insertText(md)
  },
  onRejectedFile: (file) => {
    toasts.error(`Only image files are supported. "${file.name}" is not an image.`)
  },
})
</script>

<template>
  <div
    :id="editorId"
    class="group min-h-card bg-base-100 hover:shadow-accent/5 border-base-300 relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
    :class="{'ring-offset-base-100 ring-accent/50 ring-2': isDraggingOver}"
  >
    <div class="bg-base-100 flex w-full shrink-0 items-center justify-between gap-2 px-4 py-2">
      <div class="relative flex min-w-0 flex-1 items-center gap-2">
        <DynamicTagsPanel class="w-full" :tags="tagsStore.tags" :selected-tags="activeTagIds" empty-message="No daily tags" @select="onSelectTag" />
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <BasePopup hide-header container-class="p-0 min-w-40" position="center" content-class="p-3">
          <template #trigger="{toggle}">
            <BaseButton variant="outline" class="border-accent/30 text-accent hover:bg-accent/10 px-2" size="sm" @click="toggle">
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
          tooltip="Cancel"
          class="text-base-content bg-base-content/5 hover:bg-base-content/10 size-7 rounded-sm p-0"
          @click="onCancel"
        />

        <BaseButton
          class="bg-success/20 hover:bg-success/30 text-success h-7 rounded-sm px-8"
          size="sm"
          icon="check"
          :tooltip="isNewTask ? 'Create' : 'Save'"
          icon-class="size-4"
          @click="onSave"
        />
      </div>
    </div>

    <div class="relative mb-1 flex max-h-[81vh] min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      <div
        ref="container"
        class="bg-base-100 border-base-300 h-full min-h-24 w-full cursor-text overflow-y-auto rounded-lg border transition-colors"
        :class="{'ring-offset-base-100 ring-accent/50 ring-2': isDraggingOver}"
      ></div>
      <FloatingToolbar v-if="view" :editor-view="view" />

      <div class="text-base-content/60 hidden shrink-0 items-center justify-center gap-6 text-[10px] md:flex">
        <div class="flex items-center gap-1.5">
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">#tag</kbd>
          <span>Attach tag</span>
          <span>/</span>
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">-#tag</kbd>
          <span>Detach tag</span>
        </div>

        <div class="flex items-center gap-1.5">
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">Esc</kbd>
          <span>Cancel</span>
        </div>

        <div class="flex items-center gap-1.5">
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1"> ⌘ </kbd>
          <span>+</span>
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">Enter</kbd>
          <span>Save & Close</span>
        </div>

        <div class="flex items-center gap-1.5">
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1"> ⌘ </kbd>
          <span>+</span>
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1"> ⇧ </kbd>
          <span>+</span>
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">Enter</kbd>
          <span>Save & Continue</span>
        </div>
      </div>

      <div class="text-base-content/60 flex shrink-0 items-center justify-center gap-4 text-[10px] md:hidden">
        <div class="flex items-center gap-1.5">
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">Esc</kbd>
          <span>Cancel</span>
        </div>

        <div class="flex items-center gap-1.5">
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1"> ⌘ </kbd>
          <span>+</span>
          <kbd class="bg-base-content/10 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1">Enter</kbd>
          <span>Save</span>
        </div>
      </div>
    </div>
  </div>
</template>
