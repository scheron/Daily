<script setup lang="ts">
import {computed} from "vue"

const RING_RADIUS = 16
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

type DonutSegment = {
  /** Relative magnitude; the arc is `value / sum(values)` of the ring. */
  value: number
  /** Segment color; `null` / omitted renders the neutral token. */
  color?: string | null
  /** Optional label, reserved for future tooltip/legend use. */
  label?: string
}

const props = withDefaults(
  defineProps<{
    segments: DonutSegment[]
    /** Outer diameter in px (the SVG scales to it). */
    size?: number
    /** Stroke width in viewBox-36 units. */
    thickness?: number
  }>(),
  {size: 48, thickness: 3.5},
)

const arcs = computed(() => {
  const totalValue = props.segments.reduce((sum, segment) => sum + segment.value, 0)
  let consumed = 0
  return props.segments.map((segment) => {
    const length = totalValue > 0 ? (segment.value / totalValue) * RING_LENGTH : 0
    const arc = {
      dash: `${length} ${RING_LENGTH - length}`,
      offset: consumed === 0 ? 0 : -consumed,
      color: segment.color ?? null,
    }
    consumed += length
    return arc
  })
})

const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0))
</script>

<template>
  <div class="relative shrink-0" :style="{width: `${size}px`, height: `${size}px`}">
    <svg viewBox="0 0 36 36" class="size-full -rotate-90">
      <circle class="text-base-300" cx="18" cy="18" :r="RING_RADIUS" fill="none" stroke="currentColor" :stroke-width="thickness" />
      <circle
        v-for="(arc, i) in arcs"
        :key="i"
        class="transition-[stroke-dashoffset,stroke-dasharray] duration-500"
        cx="18"
        cy="18"
        :r="RING_RADIUS"
        fill="none"
        :stroke-width="thickness"
        :class="arc.color ? '' : 'text-base-content/30'"
        :stroke="arc.color || 'currentColor'"
        :stroke-dasharray="arc.dash"
        :stroke-dashoffset="arc.offset"
      />
    </svg>
    <span class="absolute inset-0 flex flex-col items-center justify-center leading-none">
      <slot>{{ total }}</slot>
    </span>
  </div>
</template>
