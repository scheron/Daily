import {computed, ref, shallowRef} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {API} from "@/api"
import {applyChangeset} from "@/utils/storage/applyChangeset"

import type {Changeset} from "@daily/core"
import type {Subtask, SubtaskCounts, Task} from "@daily/protocol"

function compareSubtasks(a: Subtask, b: Subtask): number {
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * A task's subtasks, read when that task is first opened and held from then on, the way comments are.
 * The board never needs their content, only how many are done: that comes from the counts map, which
 * covers every task and is reread whenever a broadcast names a subtask, in windows that loaded them.
 *
 * Rows of a task nobody has opened are dropped from a broadcast rather than cached half-complete.
 */
export const useSubtasksStore = defineStore("subtasks", () => {
  const subtasks = shallowRef<Subtask[]>([])
  const subtaskCounts = ref<SubtaskCounts>({})
  const loadedTaskIds = ref(new Set<Task["id"]>())
  const pendingTaskIds = ref(new Set<Task["id"]>())
  let wantsCounts = false

  const subtasksByTaskId = computed(() => {
    const map = new Map<Task["id"], Subtask[]>()

    for (const subtask of subtasks.value) {
      const list = map.get(subtask.taskId)
      if (list) list.push(subtask)
      else map.set(subtask.taskId, [subtask])
    }

    for (const list of map.values()) {
      list.sort(compareSubtasks)
    }

    return map
  })

  /** One task's subtasks in their order. Empty both for a task with none and for one never read. */
  function subtasksOf(taskId: Task["id"]): Subtask[] {
    return subtasksByTaskId.value.get(taskId) ?? []
  }

  /** Done and total for a task, or null when it has no subtasks. Read from the counts map, which holds every task. */
  function countOf(taskId: Task["id"]): {done: number; total: number} | null {
    return subtaskCounts.value[taskId] ?? null
  }

  async function loadSubtaskCounts(): Promise<void> {
    wantsCounts = true
    try {
      subtaskCounts.value = await API.getSubtaskCounts()
    } catch (error) {
      console.error("Failed to load subtask counts:", error)
    }
  }

  /** Reads a task's subtasks. Already-read tasks are skipped. */
  async function loadSubtasks(taskId: Task["id"]): Promise<void> {
    if (loadedTaskIds.value.has(taskId)) return
    if (pendingTaskIds.value.has(taskId)) return

    pendingTaskIds.value = new Set(pendingTaskIds.value).add(taskId)

    try {
      const list = await API.getSubtasksOfTask(taskId)
      subtasks.value = [...subtasks.value.filter((subtask) => subtask.taskId !== taskId), ...list]
      loadedTaskIds.value = new Set(loadedTaskIds.value).add(taskId)
    } catch (error) {
      console.error("Failed to load subtasks:", error)
      throw error
    } finally {
      const pending = new Set(pendingTaskIds.value)
      pending.delete(taskId)
      pendingTaskIds.value = pending
    }
  }

  /** Writes a subtask last in a task. Content that is only whitespace is refused by storage and changes nothing. */
  async function addSubtask(taskId: Task["id"], content: string): Promise<boolean> {
    return write("add the subtask", async () => {
      await loadSubtasks(taskId)
      return API.createSubtask(taskId, content)
    })
  }

  async function updateSubtask(id: Subtask["id"], updates: {content?: string; done?: boolean}): Promise<boolean> {
    return write("update the subtask", () => API.updateSubtask(id, updates))
  }

  async function removeSubtask(id: Subtask["id"]): Promise<boolean> {
    return write("delete the subtask", () => API.deleteSubtask(id))
  }

  /** Turns a subtask into a task. Storage creates the task and removes the subtask in one write; both reach this window through the broadcast. */
  async function makeTask(id: Subtask["id"]): Promise<Task | null> {
    try {
      return await API.makeTaskFromSubtask(id)
    } catch (error) {
      console.error("Failed to make a task from a subtask", error)
      toasts.error("Failed to make a task")
      return null
    }
  }

  /** Folds a broadcast in, keeping only rows of tasks this window has read; the counts are reread whenever a subtask is named. */
  function applyBroadcast(changeset: Changeset): void {
    const upserted = changeset.subtasks?.upserted?.filter((subtask) => loadedTaskIds.value.has(subtask.taskId))
    const removed = changeset.subtasks?.removed

    if (wantsCounts && (changeset.subtasks?.upserted?.length || removed?.length)) void loadSubtaskCounts()

    if (!upserted?.length && !removed?.length) return

    applyChangeset({subtasks}, {subtasks: {upserted, removed}})
  }

  async function write(action: string, run: () => Promise<Changeset>): Promise<boolean> {
    try {
      applyChangeset({subtasks}, await run())
      return true
    } catch (error) {
      console.error(`Failed to ${action}`, error)
      toasts.error(`Failed to ${action}`)
      return false
    }
  }

  return {
    subtasks,
    subtaskCounts,
    subtasksOf,
    countOf,
    loadSubtaskCounts,
    loadSubtasks,
    addSubtask,
    updateSubtask,
    removeSubtask,
    makeTask,
    applyBroadcast,
  }
})
