import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskCommentsStore} from "@/stores/taskComments.store"

import type {TaskComment} from "@daily/protocol"

const commentEdits = new WeakMap<ReturnType<typeof useTaskCommentsStore>, Map<TaskComment["id"], symbol>>()

export const useTaskComments = createSharedComposable(() => {
  const taskCommentsStore = useTaskCommentsStore()
  const taskEditorStore = useTaskEditorStore()
  const {editingTaskId, pendingComments} = storeToRefs(taskEditorStore)

  const comments = computed<TaskComment[]>(() => {
    if (!editingTaskId.value) return pendingComments.value
    return taskCommentsStore.commentsOf(editingTaskId.value)
  })

  async function addComment(content: string): Promise<boolean> {
    if (!editingTaskId.value) return taskEditorStore.addPendingComment(content)
    return taskCommentsStore.addComment(editingTaskId.value, content)
  }

  function prepareCommentEdit(id: TaskComment["id"], content: string): () => Promise<boolean> {
    if (taskEditorStore.isPendingId(id)) {
      const updated = taskEditorStore.updatePendingComment(id, content)
      return () => Promise.resolve(updated)
    }
    let edits = commentEdits.get(taskCommentsStore)
    if (!edits) {
      edits = new Map()
      commentEdits.set(taskCommentsStore, edits)
    }
    const version = Symbol()
    edits.set(id, version)
    return async () => {
      if (edits.get(id) !== version) return false
      const saved = await taskCommentsStore.editComment(id, content)
      if (saved && edits.get(id) === version) edits.delete(id)
      return saved
    }
  }

  async function removeComment(id: TaskComment["id"]): Promise<boolean> {
    if (taskEditorStore.isPendingId(id)) return taskEditorStore.removePendingComment(id)
    const removed = await taskCommentsStore.removeComment(id)
    if (removed) commentEdits.get(taskCommentsStore)?.delete(id)
    return removed
  }

  watch(
    editingTaskId,
    (taskId) => {
      if (taskId) taskCommentsStore.loadComments(taskId).catch(() => undefined)
    },
    {immediate: true},
  )

  return {comments, addComment, prepareCommentEdit, removeComment}
})
