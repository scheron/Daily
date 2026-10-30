import {computed, onBeforeUnmount, ref, watch} from "vue"

import {useSubtasksStore} from "@/stores/subtasks.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {openedSubtaskId} from "@/ui/modules/RightPanel/composables/useSubtaskEditorOpen"
import {useTaskSubtasks} from "@/ui/modules/RightPanel/composables/useTaskSubtasks"

import type {Subtask} from "@daily/protocol"
import type {Ref} from "vue"

const WRITE_DELAY_MS = 400

export function useSubtaskWrite(subtaskId: Ref<Subtask["id"]>) {
  const taskEditorStore = useTaskEditorStore()
  const subtasksStore = useSubtasksStore()
  const {subtasks, addSubtask, updateSubtask, removeSubtask, makeTask: makeSubtask} = useTaskSubtasks()

  const taskId = taskEditorStore.editingTaskId
  const targetId = ref(subtaskId.value)
  const subtask = computed(() => subtasks.value.find((item) => item.id === targetId.value))
  const content = ref(subtask.value?.content ?? "")
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let writing: Promise<boolean> = Promise.resolve(true)
  let queued = 0
  let leaving = false
  let removed = false
  let unmounted = false
  let lastDone = subtask.value?.done ?? false

  watch(subtask, (item) => {
    if (item) lastDone = item.done
  })

  function onContentChange(next: string) {
    content.value = next
    if (leaving || !next.trim()) return
    pending = next
    clearTimeout(timer)
    if (taskEditorStore.isPendingId(targetId.value)) void flush()
    else timer = setTimeout(flush, WRITE_DELAY_MS)
  }

  function flush(): Promise<boolean> {
    clearTimeout(timer)
    if (pending === null) return queued ? writing : Promise.resolve(true)
    const next = pending
    pending = null
    return enqueue(() => run({content: next}))
  }

  function enqueue(job: () => Promise<boolean>): Promise<boolean> {
    queued++
    writing = writing.then(job).finally(() => queued--)
    return writing
  }

  async function run(updates: {content?: string; done?: boolean}): Promise<boolean> {
    if (removed) return false
    const id = targetId.value
    if (!taskId || unmounted || subtasksStore.subtasksOf(taskId).some((item) => item.id === id)) return updateSubtask(id, updates)

    const text = (updates.content ?? content.value).trim()
    if (!text) return false
    const created = await addSubtask(text, taskId)
    if (!created) return false
    targetId.value = created.id
    if (!unmounted) openedSubtaskId.value = created.id
    return (updates.done ?? lastDone) ? updateSubtask(created.id, {done: true}) : true
  }

  function toggleDone() {
    if (leaving) return
    void enqueue(() => run({done: !subtask.value?.done}))
  }

  async function remove(): Promise<boolean> {
    leaving = true
    clearTimeout(timer)
    pending = null
    const deleted = await enqueue(async () => {
      const ok = await removeSubtask(targetId.value)
      removed = ok
      return ok
    })
    if (!deleted) leaving = false
    return deleted
  }

  async function startMakeTask() {
    leaving = true
    const task = await makeSubtask(targetId.value)
    if (!task) leaving = false
    return task
  }

  onBeforeUnmount(() => {
    unmounted = true
    void flush()
  })

  return {content, subtask, onContentChange, flush, toggleDone, remove, startMakeTask}
}
