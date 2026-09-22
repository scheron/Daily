<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"

defineProps<{
  label: string
  isEmpty?: boolean
}>()

const emit = defineEmits<{click: []}>()

function getCellVariant(isEmpty?: boolean) {
  return isEmpty ? "cell-muted" : "cell"
}
</script>

<template>
  <BaseButton :variant="getCellVariant(isEmpty)" class="w-full min-w-0" @click="emit('click')">
    <slot name="icon" />
    <span class="min-w-0 flex-1 truncate text-left leading-none">{{ label }}</span>
  </BaseButton>
</template>
