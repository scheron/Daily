<script setup lang="ts">
import {computed} from "vue"

const RING_RADIUS = 16
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const props = withDefaults(
  defineProps<{
    /** The fill fraction is `value / max`, clamped to `[0, 1]`. */
    value: number
    max?: number
  }>(),
  {max: 100},
)

const offset = computed(() => {
  const fraction = props.max > 0 ? Math.min(1, Math.max(0, props.value / props.max)) : 0
  return RING_LENGTH * (1 - fraction)
})
</script>

<template>
  <div class="shrink-0" :style="{width: '18px', height: '18px'}">
    <svg viewBox="0 0 36 36" class="size-full -rotate-90">
      <circle class="text-base-300" cx="18" cy="18" :r="RING_RADIUS" fill="none" stroke="currentColor" stroke-width="5" />
      <circle
        class="text-accent transition-[stroke-dashoffset] duration-500"
        cx="18"
        cy="18"
        :r="RING_RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-width="5"
        stroke-linecap="round"
        :stroke-dasharray="RING_LENGTH"
        :stroke-dashoffset="offset"
      />
    </svg>
  </div>
</template>
