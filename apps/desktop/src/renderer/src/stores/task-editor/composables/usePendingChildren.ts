import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {API} from "@/api"

import type {TaskDraft} from "@/types/taskDraft"
import type {Subtask, Task, TaskComment} from "@daily/protocol"
import type {Ref} from "vue"

const PENDING_TASK_ID = "__draft__"
const PENDING_PREFIX = "pending:"

type PendingChildrenContext = {
  draft: Ref<TaskDraft | null>
}

export function usePendingChildren(ctx: PendingChildrenContext) {
  const {draft} = ctx

  const pendingSubtasks = ref<Subtask[]>([])
  const pendingComments = ref<TaskComment[]>([])
  let pendingSeq = 0

  const hasPending = computed(() => pendingSubtasks.value.length > 0 || pendingComments.value.length > 0)

  function isPendingId(id: string): boolean {
    return id.startsWith(PENDING_PREFIX)
  }

  /** Keeps a subtask with a new task's draft; it is written once Save has created the task. */
  function addPendingSubtask(content: string): boolean {
    const text = content.trim()
    if (!text) return false
    const at = new Date().toISOString()
    pendingSubtasks.value = [
      ...pendingSubtasks.value,
      {
        id: `${PENDING_PREFIX}${++pendingSeq}`,
        taskId: PENDING_TASK_ID,
        content: text,
        done: false,
        orderKey: "",
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      },
    ]
    return true
  }

  function updatePendingSubtask(id: Subtask["id"], updates: {content?: string; done?: boolean}): boolean {
    pendingSubtasks.value = pendingSubtasks.value.map((item) => (item.id === id ? {...item, ...updates} : item))
    return true
  }

  function removePendingSubtask(id: Subtask["id"]): boolean {
    pendingSubtasks.value = pendingSubtasks.value.filter((item) => item.id !== id)
    return true
  }

  /** Keeps a comment with a new task's draft; it is written once Save has created the task. */
  function addPendingComment(content: string): boolean {
    const text = content.trim()
    if (!text) return false
    const at = new Date().toISOString()
    pendingComments.value = [
      ...pendingComments.value,
      {
        id: `${PENDING_PREFIX}${++pendingSeq}`,
        taskId: PENDING_TASK_ID,
        branchId: draft.value?.branchId ?? "",
        content: text,
        kind: "manual",
        provider: null,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      },
    ]
    return true
  }

  function updatePendingComment(id: TaskComment["id"], content: string): boolean {
    pendingComments.value = pendingComments.value.map((item) => (item.id === id ? {...item, content} : item))
    return true
  }

  function removePendingComment(id: TaskComment["id"]): boolean {
    pendingComments.value = pendingComments.value.filter((item) => item.id !== id)
    return true
  }

  function clearPending() {
    pendingSubtasks.value = []
    pendingComments.value = []
  }

  async function writePending(taskId: Task["id"]) {
    let failed = 0

    while (pendingSubtasks.value.length || pendingComments.value.length) {
      const subtask = pendingSubtasks.value[0]
      const comment = subtask ? undefined : pendingComments.value[0]

      try {
        if (subtask) {
          const written = (await API.createSubtask(taskId, subtask.content)).subtasks?.upserted?.[0]
          if (subtask.done && written) await API.updateSubtask(written.id, {done: true})
        } else if (comment) {
          await API.createTaskComment(taskId, comment.content)
        }
      } catch (error) {
        failed++
        console.error("Failed to write a subtask or comment of the new task", error)
      }

      if (subtask) removePendingSubtask(subtask.id)
      else if (comment) removePendingComment(comment.id)
    }

    if (failed) toasts.error(failed === 1 ? "Failed to save a subtask or comment" : `Failed to save ${failed} subtasks and comments`)
  }

  return {
    pendingSubtasks,
    pendingComments,
    hasPending,

    isPendingId,
    addPendingSubtask,
    updatePendingSubtask,
    removePendingSubtask,
    addPendingComment,
    updatePendingComment,
    removePendingComment,
    clearPending,
    writePending,
  }
}
