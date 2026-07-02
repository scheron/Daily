import {computed, ref, watch} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import {createSharedComposable} from "@/composables/createSharedComposable"
import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"

import type {TaskDraft} from "@/types/tasks"
import type {Task} from "@shared/types/storage"

export const useTaskEditor = createSharedComposable(() => {
  const taskEditorStore = useTaskEditorStore()

  const columns = useTaskColumns()
  const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

  const localContent = ref("")

  const activeTask = computed<Task | null>(() => {
    if (!taskEditorStore.isOpen || !taskEditorStore.draft) return null
    return buildDraftTask(taskEditorStore.draft)
  })

  const isOpen = computed(() => taskEditorStore.isOpen && !!activeTask.value)
  const isNew = computed(() => taskEditorStore.isNew)
  const isEditing = computed(() => !!activeTask.value && !isNew.value)
  const editingTaskId = computed(() => taskEditorStore.editingTaskId)

  const flatOrderedTasks = computed<Task[]>(() => {
    if (taskEditorStore.isNew) return []
    return [...columns.tasksByStatus.value.active, ...columns.tasksByStatus.value.done, ...columns.tasksByStatus.value.discarded]
  })

  const currentIndex = computed(() => {
    if (taskEditorStore.isNew || !taskEditorStore.editingTaskId) return -1
    return flatOrderedTasks.value.findIndex((t) => t.id === taskEditorStore.editingTaskId)
  })

  const canPrev = computed(() => !taskEditorStore.isNew && currentIndex.value > 0)
  const canNext = computed(() => !taskEditorStore.isNew && currentIndex.value >= 0 && currentIndex.value < flatOrderedTasks.value.length - 1)

  const canSave = computed(() => {
    if (!taskEditorStore.isOpen) return false
    if (!taskEditorStore.isDirty) return false
    return (taskEditorStore.draft?.content.trim().length ?? 0) > 0
  })

  function onBodyChange(next: string) {
    localContent.value = next
    taskEditorStore.patch({content: next})
  }

  async function navigatePrev() {
    if (!canPrev.value) return
    const proceed = await confirmLeaveIfDirty()
    if (!proceed) return
    taskEditorStore.open(flatOrderedTasks.value[currentIndex.value - 1].id)
  }

  async function navigateNext() {
    if (!canNext.value) return
    const proceed = await confirmLeaveIfDirty()
    if (!proceed) return
    taskEditorStore.open(flatOrderedTasks.value[currentIndex.value + 1].id)
  }

  async function commitDraft() {
    if (!canSave.value) return
    await taskEditorStore.commit()
    if (taskEditorStore.isNew) taskEditorStore.clear()
  }

  async function commitDraftAndClose() {
    if (!canSave.value) return
    await taskEditorStore.commitAndClose()
  }

  async function close() {
    const proceed = await confirmLeaveIfDirty()
    if (!proceed) return
    taskEditorStore.clear()
  }

  watch(
    () => [taskEditorStore.editingTaskId, taskEditorStore.isNew] as const,
    () => {
      localContent.value = taskEditorStore.draft?.content ?? ""
    },
    {immediate: true},
  )

  return {
    activeTask,
    isOpen,
    isNew,
    isEditing,
    editingTaskId,
    localContent,
    currentIndex,
    canPrev,
    canNext,
    canSave,
    flatOrderedTasks,
    onBodyChange,
    navigatePrev,
    navigateNext,
    commitDraft,
    commitDraftAndClose,
    close,
  }
})

const DRAFT_TASK_ID = "__draft__"

function buildDraftTask(draft: TaskDraft): Task {
  return {
    id: DRAFT_TASK_ID,
    branchId: draft.branchId ?? "",
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    scheduled: draft.scheduled,
    estimatedTime: draft.estimatedTime,
    spentTime: draft.spentTime,
    content: draft.content,
    minimized: false,
    orderIndex: 0,
    status: draft.status,
    tags: draft.tags,
    attachments: [] as string[],
  }
}
