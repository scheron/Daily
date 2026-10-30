<script setup lang="ts">
import {computed, ref} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {openSubtask} from "@/ui/modules/RightPanel/composables/useSubtaskEditorOpen"
import {useTaskSubtasks} from "@/ui/modules/RightPanel/composables/useTaskSubtasks"
import SubtaskItem from "./{fragments}/SubtaskItem.vue"

import type {Subtask} from "@daily/protocol"

const {subtasks, count, addSubtask, updateSubtask, removeSubtask} = useTaskSubtasks()

const isAdding = ref(false)
const isHidingCompleted = ref(false)

const visibleSubtasks = computed(() => (isHidingCompleted.value ? subtasks.value.filter((subtask) => !subtask.done) : subtasks.value))

async function add(content: string) {
  isAdding.value = false
  await addSubtask(content)
}

function setSubtaskDone(id: Subtask["id"], done: boolean) {
  void updateSubtask(id, {done})
}
</script>

<template>
  <section class="flex flex-col pb-2">
    <div class="flex min-h-8 items-center gap-1.5 px-4 text-sm font-semibold">
      <BaseIcon name="list-checks" class="size-4" />
      <span>Subtasks</span>
      <span v-if="count" class="bg-base-content/10 text-base-content/60 rounded-full px-2 py-0.5 text-xs font-semibold"
        >{{ count.done }}/{{ count.total }}</span
      >
      <BaseButton variant="ghost-muted" icon="plus" size="xs" tooltip="Add subtask" @click="isAdding = true" />

      <div aria-hidden="true" class="flex-1" />
      <BaseButton
        variant="ghost-muted"
        icon="eye-off"
        size="xs"
        :class="isHidingCompleted && 'bg-base-content/10 text-base-content'"
        :aria-pressed="isHidingCompleted"
        :tooltip="isHidingCompleted ? 'Show completed' : 'Hide completed'"
        @click="isHidingCompleted = !isHidingCompleted"
      />
    </div>

    <SubtaskItem
      v-for="subtask in visibleSubtasks"
      :key="subtask.id"
      :subtask="subtask"
      @set-done="setSubtaskDone(subtask.id, $event)"
      @save="updateSubtask(subtask.id, {content: $event})"
      @remove="removeSubtask(subtask.id)"
      @open="openSubtask(subtask.id)"
    />

    <SubtaskItem v-if="isAdding" @save="add" @cancel="isAdding = false" />
  </section>
</template>
