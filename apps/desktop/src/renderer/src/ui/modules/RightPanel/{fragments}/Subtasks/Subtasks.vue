<script setup lang="ts">
import {computed, ref, watch} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {useTaskSubtasks} from "@/ui/modules/RightPanel/composables/useTaskSubtasks"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import SubtaskEditor from "./{fragments}/SubtaskEditor.vue"
import SubtaskItem from "./{fragments}/SubtaskItem.vue"

import type {Subtask} from "@daily/protocol"

const {subtasks, addSubtask, updateSubtask, removeSubtask, makeTask} = useTaskSubtasks()
const taskEditorStore = useTaskEditorStore()
const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

const isAdding = ref(false)
const isSaving = ref(false)
const editingId = ref<Subtask["id"] | null>(null)

const editingSubtask = computed(() => subtasks.value.find((subtask) => subtask.id === editingId.value) ?? null)

async function save(content: string) {
  if (isSaving.value) return
  isSaving.value = true
  const target = editingSubtask.value
  const wasAdding = isAdding.value
  const isSaved = target ? await updateSubtask(target.id, {content}) : await addSubtask(content)
  isSaving.value = false
  if (isSaved && editingId.value === (target?.id ?? null) && isAdding.value === wasAdding) close()
}

function setSubtaskDone(id: Subtask["id"], done: boolean) {
  void updateSubtask(id, {done})
}

async function makeTaskAndOpen(id: Subtask["id"]) {
  const task = await makeTask(id)
  if (task && (await confirmLeaveIfDirty())) taskEditorStore.open(task.id)
}

function close() {
  isAdding.value = false
  editingId.value = null
}

watch(editingSubtask, (subtask) => {
  if (editingId.value && !subtask) {
    editingId.value = null
    isAdding.value = true
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <SubtaskEditor v-if="isAdding || editingSubtask" :content="editingSubtask?.content" :saving="isSaving" @save="save" @cancel="close" />

    <template v-else>
      <div v-if="!subtasks.length" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <BaseIcon name="list-checks" class="text-base-content/15 size-7" />
        <span class="text-base-content/50 text-sm">No subtasks yet</span>
      </div>

      <div v-else class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        <SubtaskItem
          v-for="subtask in subtasks"
          :key="subtask.id"
          :subtask="subtask"
          @set-done="setSubtaskDone(subtask.id, $event)"
          @edit="editingId = subtask.id"
          @make-task="makeTaskAndOpen(subtask.id)"
          @remove="removeSubtask(subtask.id)"
        />
      </div>

      <div class="border-base-300 shrink-0 border-t px-4 py-2.5">
        <BaseButton variant="text" icon="plus" size="sm" @click="isAdding = true">Add subtask</BaseButton>
      </div>
    </template>
  </div>
</template>
