<script setup lang="ts">
import {computed} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {Task, TaskStatus} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()

const column = computed(() => TASK_COLUMNS.find((s) => s.status === props.task.status)!)

function selectStatus(status: TaskStatus, hide: () => void) {
  if (status !== props.task.status) taskEditorStore.patch({status})
  hide()
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <BaseButton class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" :class="column.titleClass" @click.stop="toggle">
        <BaseIcon :name="column.icon" class="size-4" />
        <span class="tracking-wide uppercase">{{ column.label }}</span>
      </BaseButton>
    </template>

    <template #default="{hide}">
      <div class="flex flex-col gap-0.5">
        <BaseButton
          v-for="option in TASK_COLUMNS"
          :key="option.status"
          class="flex items-center justify-start gap-2 text-left"
          size="sm"
          :class="option.titleClass"
          variant="ghost"
          @click="selectStatus(option.status, hide)"
        >
          <BaseIcon :name="option.icon" class="size-4" />
          <span class="text-sm tracking-wide uppercase">{{ option.label }}</span>
        </BaseButton>
      </div>
    </template>
  </BasePopup>
</template>
