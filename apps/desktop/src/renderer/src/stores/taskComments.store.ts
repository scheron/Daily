import {computed, ref, shallowRef} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {API} from "@/api"
import {applyChangeset} from "@/utils/storage/applyChangeset"

import type {Changeset} from "@daily/core"
import type {Task, TaskComment} from "@daily/protocol"

/**
 * A task's comments, read when that task is first opened and held from then on. Unlike tasks and
 * relations, comments are not loaded at startup: a comment belongs to one task and is only ever
 * drawn beside it, so a per-task read is not a new way of selecting tasks (ADR 0003) and there is
 * nothing to gain from holding every task's thread.
 *
 * The collection therefore holds the comments of the tasks loaded so far, and `isLoaded` is what
 * separates "this task has no comments" from "this task has not been read yet". A broadcast — a
 * sync pull, another window — reaches it through `applyChangeset` like every other collection, and
 * rows belonging to a task nobody has opened are dropped rather than cached half-complete.
 */
export const useTaskCommentsStore = defineStore("taskComments", () => {
  const comments = shallowRef<TaskComment[]>([])
  const loadedTaskIds = ref(new Set<Task["id"]>())
  const pendingTaskIds = ref(new Set<Task["id"]>())

  const commentsByTaskId = computed(() => {
    const map = new Map<Task["id"], TaskComment[]>()

    for (const comment of comments.value) {
      const thread = map.get(comment.taskId)
      if (thread) thread.push(comment)
      else map.set(comment.taskId, [comment])
    }

    for (const thread of map.values()) {
      thread.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    }

    return map
  })

  /** One task's comments, oldest first. Empty both for a task with none and for one never read — ask `isLoaded` to tell them apart. */
  function commentsOf(taskId: Task["id"]): TaskComment[] {
    return commentsByTaskId.value.get(taskId) ?? []
  }

  function isLoaded(taskId: Task["id"]): boolean {
    return loadedTaskIds.value.has(taskId)
  }

  function isLoading(taskId: Task["id"]): boolean {
    return pendingTaskIds.value.has(taskId)
  }

  /** Reads a task's comments. Already-read tasks are skipped unless `force` says to read again. */
  async function loadComments(taskId: Task["id"], options?: {force?: boolean}): Promise<void> {
    if (!options?.force && loadedTaskIds.value.has(taskId)) return
    if (pendingTaskIds.value.has(taskId)) return

    pendingTaskIds.value = new Set(pendingTaskIds.value).add(taskId)

    try {
      const thread = await API.getTaskComments(taskId)
      comments.value = [...comments.value.filter((comment) => comment.taskId !== taskId), ...thread]
      loadedTaskIds.value = new Set(loadedTaskIds.value).add(taskId)
    } catch (error) {
      console.error("Failed to load task comments:", error)
      throw error
    } finally {
      const pending = new Set(pendingTaskIds.value)
      pending.delete(taskId)
      pendingTaskIds.value = pending
    }
  }

  /** Writes a comment on a task. Content that is only whitespace is refused by storage and changes nothing. */
  async function addComment(taskId: Task["id"], content: string): Promise<boolean> {
    try {
      await loadComments(taskId)
      applyChangeset({comments}, await API.createTaskComment(taskId, content))
      return true
    } catch (error) {
      console.error("Failed to add a comment", error)
      toasts.error("Failed to add the comment")
      return false
    }
  }

  async function editComment(id: TaskComment["id"], content: string): Promise<boolean> {
    try {
      applyChangeset({comments}, await API.updateTaskComment(id, content))
      return true
    } catch (error) {
      console.error("Failed to edit a comment", error)
      toasts.error("Failed to edit the comment")
      return false
    }
  }

  async function removeComment(id: TaskComment["id"]): Promise<boolean> {
    try {
      applyChangeset({comments}, await API.deleteTaskComment(id))
      return true
    } catch (error) {
      console.error("Failed to delete a comment", error)
      toasts.error("Failed to delete the comment")
      return false
    }
  }

  /** Folds a broadcast in, keeping only what belongs to a task this window has already read. */
  function applyBroadcast(changeset: Changeset): void {
    const upserted = changeset.comments?.upserted?.filter((comment) => loadedTaskIds.value.has(comment.taskId))
    const removed = changeset.comments?.removed

    if (!upserted?.length && !removed?.length) return

    applyChangeset({comments}, {comments: {upserted, removed}})
  }

  return {
    comments,
    commentsByTaskId,
    commentsOf,
    isLoaded,
    isLoading,
    loadComments,
    addComment,
    editComment,
    removeComment,
    applyBroadcast,
  }
})
