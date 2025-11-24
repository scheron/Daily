<script setup lang="ts">
import type {Tag} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"

defineProps<{tag: Tag; active?: boolean}>()
</script>

<template>
  <BaseButton
    variant="outline"
    size="sm"
    class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent relative shrink-0 gap-0 rounded-md px-2 transition-all duration-200 hover:opacity-100"
    :style="{
      borderColor: active ? tag.color : `${tag.color}20`,
      backgroundColor: active ? `${tag.color}40` : `${tag.color}20`,
      color: tag.color,
    }"
  >
    <span v-if="tag.emoji" class="mr-1 text-xs">{{ tag.emoji }}</span>
    <span v-else class="text-sm leading-0">#</span>
    <span class="truncate text-xs">{{ tag.name }}</span>
  </BaseButton>
</template>
