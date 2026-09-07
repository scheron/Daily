<script setup lang="ts">
import {computed} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import StatusPicker from "@/ui/common/pickers/StatusPicker.vue"

import type {Task, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()

const model = computed({
  get: () => props.task.status,
  set: (status: TaskStatus) => {
    if (status !== props.task.status) taskEditorStore.patch({status})
  },
})
</script>

<template>
  <StatusPicker v-model="model" position="start">
    <template #trigger="{toggle, current, colorClass}">
      <BaseButton class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" :class="colorClass" @click.stop="toggle">
        <BaseIcon :name="current.icon" class="size-4" />
        <span class="uppercase tracking-wide">{{ current.label }}</span>
      </BaseButton>
    </template>
  </StatusPicker>
</template>
