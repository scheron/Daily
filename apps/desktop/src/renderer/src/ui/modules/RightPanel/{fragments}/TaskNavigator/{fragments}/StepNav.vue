<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"

withDefaults(defineProps<{canPrev?: boolean; canNext?: boolean}>(), {
  canPrev: true,
  canNext: true,
})

defineEmits<{prev: []; next: []}>()
</script>

<template>
  <div class="border-base-300 bg-base-100/40 inline-flex items-center overflow-hidden rounded-full border">
    <BaseButton variant="ghost" icon="chevron-up" size="xs" :disabled="!canPrev" aria-label="Previous task" @click="$emit('prev')" />
    <div class="border-base-300 h-3 border-l" aria-hidden="true" />
    <BaseButton variant="ghost" icon="chevron-down" size="xs" :disabled="!canNext" aria-label="Next task" @click="$emit('next')" />
  </div>
</template>
