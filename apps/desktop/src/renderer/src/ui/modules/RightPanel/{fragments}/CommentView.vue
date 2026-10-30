<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskCommentsStore} from "@/stores/taskComments.store"
import BaseButton from "@/ui/base/BaseButton"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {nestedTarget} from "@/ui/modules/RightPanel/composables/useNestedView"
import {useTaskComments} from "@/ui/modules/RightPanel/composables/useTaskComments"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import {getTaskTitle} from "@/ui/modules/RightPanel/utils/getTaskTitle"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"

import type {TaskComment} from "@daily/protocol"

const props = defineProps<{commentId: TaskComment["id"]}>()

let pending: (() => Promise<boolean>) | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let writing: Promise<boolean> = Promise.resolve(true)
let leaving = false
let removed = false
let revision = 0

const taskEditorStore = useTaskEditorStore()
const taskCommentsStore = useTaskCommentsStore()
const target = nestedTarget.value
const targetId = props.commentId
const taskId = taskEditorStore.editingTaskId
const isPending = taskEditorStore.isNew

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")
const content = ref(findComment()?.content ?? "")

const comment = computed(findComment)

const {localContent} = useTaskEditor()

const parentTitle = computed(() => getTaskTitle(localContent.value) || "Task")

const {prepareCommentEdit, removeComment} = useTaskComments()

function back() {
  void flush()
  nestedTarget.value = null
}

async function onDelete() {
  leaving = true
  clearTimeout(timer)
  await writing
  const deleted = await removeComment(targetId)
  if (!deleted) {
    leaving = false
    void flush()
  } else {
    pending = null
    if (nestedTarget.value === target) nestedTarget.value = null
  }
}

function onContentChange(next: string) {
  content.value = next
  if (removed || !next.trim()) return
  revision++
  const edit = prepareCommentEdit(targetId, next)
  if (isPending) return
  pending = edit
  clearTimeout(timer)
  if (!leaving) timer = setTimeout(flush, 400)
}

function findComment() {
  const thread = isPending ? taskEditorStore.pendingComments : taskId ? taskCommentsStore.commentsOf(taskId) : []
  return thread.find((item) => item.id === targetId)
}

function flush(): Promise<boolean> {
  clearTimeout(timer)
  if (leaving || pending === null) return writing
  const write = pending
  const version = revision
  pending = null
  writing = writing.then(async () => {
    if (removed) return false
    const saved = await write()
    if (!saved && !removed && revision === version && pending === null) pending = write
    return saved
  })
  return writing
}

watch(
  comment,
  (item) => {
    if (item) return
    removed = true
    clearTimeout(timer)
    pending = null
    if (nestedTarget.value === target) nestedTarget.value = null
  },
  {flush: "sync", immediate: true},
)

onMounted(async () => {
  await nextTick()
  editorRef.value?.focus()
})

onBeforeUnmount(() => void flush())
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="h-toolbar flex shrink-0 items-center gap-2 px-4" style="-webkit-app-region: no-drag">
      <BaseButton class="min-w-0 shrink" variant="ghost" icon="chevron-left" size="sm" tooltip="Back (Esc)" @click="back">
        <span class="truncate">{{ parentTitle }}</span>
      </BaseButton>

      <div aria-hidden="true" class="flex-1" />

      <ConfirmPopup
        title="Delete comment?"
        message="This comment will be removed."
        confirm-text="Delete"
        cancel-text="Cancel"
        position="end"
        content-class="max-w-64"
        @confirm="onDelete"
      >
        <template #trigger="{show}">
          <BaseButton variant="error-ghost" icon="trash" size="sm" tooltip="Delete" @click="show" />
        </template>
      </ConfirmPopup>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex min-h-full flex-col">
        <div class="min-h-40 flex-1 cursor-text px-4 py-4">
          <MarkdownEditor ref="editor" grow attachments :content="content" @update:content="onContentChange" />
        </div>
      </div>
    </div>
  </div>
</template>
