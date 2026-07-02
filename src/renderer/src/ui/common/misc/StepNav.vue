<script setup lang="ts">
withDefaults(defineProps<{canPrev?: boolean; canNext?: boolean; prevLabel?: string; nextLabel?: string}>(), {
  canPrev: true,
  canNext: true,
  prevLabel: "Previous",
  nextLabel: "Next",
})

defineEmits<{prev: []; next: []}>()
</script>

<template>
  <div class="border-base-300 bg-base-100/40 inline-flex items-center overflow-hidden rounded-full border">
    <button
      type="button"
      class="hover:bg-base-300/60 focus-visible-accent flex size-6 items-center justify-center transition-colors disabled:opacity-30"
      :disabled="!canPrev"
      :aria-label="prevLabel"
      @click="$emit('prev')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
    <div class="border-base-300 h-3 border-l" aria-hidden="true" />
    <button
      type="button"
      class="hover:bg-base-300/60 focus-visible-accent flex size-6 items-center justify-center transition-colors disabled:opacity-30"
      :disabled="!canNext"
      :aria-label="nextLabel"
      @click="$emit('next')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  </div>
</template>
