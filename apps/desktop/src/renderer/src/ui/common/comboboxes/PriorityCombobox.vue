<script setup lang="ts">
import {PRIORITY_LEVELS} from "@/constants/priority"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"
import PriorityIcon from "@/ui/common/priority/PriorityIcon.vue"

import type {PriorityLevel} from "@/types/ui"
import type {TaskPriority} from "@daily/protocol"

defineProps<{priority: TaskPriority}>()
const emit = defineEmits<{update: [priority: TaskPriority]; close: []}>()

function selectLevel(level: PriorityLevel) {
  emit("update", level.value)
}
</script>

<template>
  <div class="w-60">
    <BaseCombobox
      single
      :items="PRIORITY_LEVELS"
      :item-key="(level) => level.value"
      :filter-by="(level) => level.label"
      placeholder="Set priority..."
      empty-text="No priorities found"
      @select="selectLevel"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <PriorityIcon :priority="item.value" class="size-4" />
        <span class="flex-1 truncate">{{ item.label }}</span>
        <BaseIcon v-if="item.value === priority" name="check" class="text-base-content/60 size-4 shrink-0" />
      </template>
    </BaseCombobox>
  </div>
</template>
