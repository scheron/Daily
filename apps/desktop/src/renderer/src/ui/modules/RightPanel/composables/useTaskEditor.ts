import {computed, ref, watch} from "vue"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"

import type {Task} from "@daily/protocol"

export const useTaskEditor = createSharedComposable(() => {
  const taskEditorStore = useTaskEditorStore()

  const localContent = ref("")

  const activeTask = computed<Task | null>(() => {
    const draft = taskEditorStore.draft
    if (!taskEditorStore.isOpen || !draft) return null

    return {
      id: "__draft__",
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
      milestoneId: draft.milestoneId ?? null,
      attachments: [] as string[],
    }
  })

  const isOpen = computed(() => taskEditorStore.isOpen && !!activeTask.value)
  const isNew = computed(() => taskEditorStore.isNew)
  const isEditing = computed(() => !!activeTask.value && !isNew.value)
  const editingTaskId = computed(() => taskEditorStore.editingTaskId)

  const columns = useTaskColumns()

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

  const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

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
    [editingTaskId, isNew],
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
