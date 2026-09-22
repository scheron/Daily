import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskCommentsStore} from "@/stores/taskComments.store"

import type {TaskComment} from "@daily/protocol"

/**
 * The open task's thread, newest first, read the first time that task is opened.
 *
 * Shared, so the tab strip's counter and the comments tab work from one read rather than one each.
 * A failed read is left to the store, which reports it and leaves the thread unread — the panel
 * then shows an empty thread instead of breaking.
 */
export const useTaskComments = createSharedComposable(() => {
  const taskCommentsStore = useTaskCommentsStore()
  const {editingTaskId} = storeToRefs(useTaskEditorStore())

  const comments = computed<TaskComment[]>(() => {
    if (!editingTaskId.value) return []
    return [...taskCommentsStore.commentsOf(editingTaskId.value)].reverse()
  })

  const count = computed(() => comments.value.length)
  const isLoading = computed(() => !!editingTaskId.value && taskCommentsStore.isLoading(editingTaskId.value))
  const isLoaded = computed(() => !!editingTaskId.value && taskCommentsStore.isLoaded(editingTaskId.value))

  async function addComment(content: string): Promise<boolean> {
    if (!editingTaskId.value) return false
    return taskCommentsStore.addComment(editingTaskId.value, content)
  }

  async function editComment(id: TaskComment["id"], content: string): Promise<boolean> {
    return taskCommentsStore.editComment(id, content)
  }

  async function removeComment(id: TaskComment["id"]): Promise<boolean> {
    return taskCommentsStore.removeComment(id)
  }

  watch(
    editingTaskId,
    (taskId) => {
      if (taskId) taskCommentsStore.loadComments(taskId).catch(() => undefined)
    },
    {immediate: true},
  )

  return {comments, count, isLoading, isLoaded, addComment, editComment, removeComment}
})
