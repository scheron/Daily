<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import {BOARD_COLUMNS} from "../../../model/constants"
import {VIEW_ORDER} from "./viewStatuses"

import type {TaskStatus} from "@shared/types/storage"

const props = defineProps<{modelValue: TaskStatus; counts: Record<TaskStatus, number>}>()

const emit = defineEmits<{"update:modelValue": [status: TaskStatus]}>()

const columns = VIEW_ORDER.map((status) => BOARD_COLUMNS.find((column) => column.status === status)!)
</script>

<template>
  <div class="bg-base-200 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5">
    <button
      v-for="column in columns"
      :key="column.status"
      type="button"
      class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors"
      :class="props.modelValue === column.status ? `bg-base-100 shadow-xs ${column.titleClass}` : 'text-base-content/60 hover:text-base-content'"
      @click="emit('update:modelValue', column.status)"
    >
      <BaseIcon :name="column.icon" class="size-4" />
      <span>{{ column.label }}</span>
      <span class="rounded-full px-1.5 py-0.5 text-xs font-medium" :class="column.counterClass">{{ props.counts[column.status] }}</span>
    </button>
  </div>
</template>
