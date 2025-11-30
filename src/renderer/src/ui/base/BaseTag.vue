<script setup lang="ts">
import type {Tag} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"

defineProps<{
  tag: Tag
  active?: boolean
  /** Whether the tag is selectable (used only for hover effects ui) */
  selectable?: boolean
}>()
</script>

<template>
  <BaseButton
    variant="outline"
    size="sm"
    class="base-tag focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent relative shrink-0 gap-0 rounded-md px-1.5 py-1 transition-all duration-200"
    :class="{active, selectable}"
    :style="{'--tag-color': tag.color}"
  >
    <span v-if="tag.emoji" class="mr-1 text-xs">{{ tag.emoji }}</span>
    <span v-else class="text-sm leading-0">#</span>
    <span class="truncate text-xs">{{ tag.name }}</span>
  </BaseButton>
</template>

<style scoped>
.base-tag {
  --tag-color: var(--color-accent);

  color: var(--tag-color);
  border-color: transparent;
  background-color: transparent;

  &.active {
    border-color: var(--tag-color);
    background-color: color-mix(in srgb, var(--tag-color) 20%, transparent);
  }

  &.selectable:hover {
    background-color: color-mix(in srgb, var(--tag-color) 20%, transparent);
  }
}
</style>
