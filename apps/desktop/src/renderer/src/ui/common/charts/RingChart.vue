<script setup lang="ts">
import {computed} from "vue"

const RING_RADIUS = 16
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const props = withDefaults(
  defineProps<{
    /** Current value; the fill fraction is `value / max` clamped to `[0, 1]`. */
    value: number
    /** Denominator of the fill fraction. */
    max?: number
    /** Outer diameter in px (the SVG scales to it). */
    size?: number
    /** Stroke width in viewBox-36 units. */
    thickness?: number
    /** Progress stroke color (any CSS color); defaults to the accent token. */
    color?: string
  }>(),
  {max: 100, size: 48, thickness: 3.5},
)

const offset = computed(() => {
  const fraction = props.max > 0 ? Math.min(1, Math.max(0, props.value / props.max)) : 0
  return RING_LENGTH * (1 - fraction)
})
</script>

<template>
  <div class="relative shrink-0" :style="{width: `${size}px`, height: `${size}px`}">
    <svg viewBox="0 0 36 36" class="size-full -rotate-90">
      <circle class="text-base-300" cx="18" cy="18" :r="RING_RADIUS" fill="none" stroke="currentColor" :stroke-width="thickness" />
      <circle
        class="text-accent transition-[stroke-dashoffset] duration-500"
        cx="18"
        cy="18"
        :r="RING_RADIUS"
        fill="none"
        :stroke="color ?? 'currentColor'"
        :stroke-width="thickness"
        stroke-linecap="round"
        :stroke-dasharray="RING_LENGTH"
        :stroke-dashoffset="offset"
      />
    </svg>
    <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold">
      <slot />
    </span>
  </div>
</template>
