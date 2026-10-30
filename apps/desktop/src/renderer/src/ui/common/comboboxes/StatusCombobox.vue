<script setup lang="ts">
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskColumn} from "@/types/ui"
import type {TaskStatus} from "@daily/protocol"

defineProps<{options: TaskColumn[]; status: TaskStatus}>()
const emit = defineEmits<{update: [status: TaskStatus]; close: []}>()
</script>

<template>
  <div class="w-60">
    <BaseCombobox
      single
      :items="options"
      :item-key="(option) => option.status"
      :filter-by="(option) => option.label"
      placeholder="Set status..."
      empty-text="No statuses found"
      @select="emit('update', $event.status)"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <BaseIcon :name="item.icon" :class="cn('size-4 shrink-0', item.titleClass)" />
        <span class="flex-1 truncate">{{ item.label }}</span>
        <BaseIcon v-if="item.status === status" name="check" class="text-base-content/60 size-4 shrink-0" />
      </template>
    </BaseCombobox>
  </div>
</template>
