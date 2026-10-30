import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskCommentsStore} from "@/stores/taskComments.store"

import type {TaskComment} from "@daily/protocol"

/**
 * The open task's thread, oldest first, read the first time that task is opened.
 *
 * Shared, so the Activity feed and the composer work from one read rather than one each.
 * A failed read is left to the store, which reports it and leaves the thread unread — the panel
 * then shows an empty thread instead of breaking.
 */
export const useTaskComments = createSharedComposable(() => {
  const taskCommentsStore = useTaskCommentsStore()
  const taskEditorStore = useTaskEditorStore()
  const {editingTaskId, pendingComments} = storeToRefs(taskEditorStore)

  const comments = computed<TaskComment[]>(() => {
    if (!editingTaskId.value) return pendingComments.value
    return taskCommentsStore.commentsOf(editingTaskId.value)
  })

  const isLoading = computed(() => !!editingTaskId.value && taskCommentsStore.isLoading(editingTaskId.value))
  const isLoaded = computed(() => !!editingTaskId.value && taskCommentsStore.isLoaded(editingTaskId.value))

  async function addComment(content: string): Promise<boolean> {
    if (!editingTaskId.value) return taskEditorStore.addPendingComment(content)
    return taskCommentsStore.addComment(editingTaskId.value, content)
  }

  async function editComment(id: TaskComment["id"], content: string): Promise<boolean> {
    if (taskEditorStore.isPendingId(id)) return taskEditorStore.updatePendingComment(id, content)
    return taskCommentsStore.editComment(id, content)
  }

  async function removeComment(id: TaskComment["id"]): Promise<boolean> {
    if (taskEditorStore.isPendingId(id)) return taskEditorStore.removePendingComment(id)
    return taskCommentsStore.removeComment(id)
  }

  watch(
    editingTaskId,
    (taskId) => {
      if (taskId) taskCommentsStore.loadComments(taskId).catch(() => undefined)
    },
    {immediate: true},
  )

  return {comments, isLoading, isLoaded, addComment, editComment, removeComment}
})
