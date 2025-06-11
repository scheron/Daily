<script setup lang="ts">
import type {Tag} from "@/types/tasks"
import BaseButton from "@/ui/base/BaseButton.vue"

defineProps<{tag: Tag; active?: boolean}>()
</script>

<template>
  <BaseButton
    variant="outline"
    size="sm"
    class="focus-visible-ring shrink-0 hover:opacity-100 rounded-md focus-visible:ring-offset-base-100 relative focus-visible:ring-base-content px-2 transition-all duration-200"
    :class="active ? 'opacity-100 ' : 'opacity-80 hover:opacity-100'"
    :style="{
      borderColor: active ? tag.color : 'transparent',
      backgroundColor: `${tag.color}60`,
      color: tag.color,
    }"
  >
    <span class="text-xs truncate">{{ tag.name }}</span>
  </BaseButton>
</template>
