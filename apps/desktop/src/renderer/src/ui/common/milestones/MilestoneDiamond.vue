<script setup lang="ts">
import {computed} from "vue"

const DIAMOND_PATH = "M12 1.5 22.5 12 12 22.5 1.5 12Z"
const DIAMOND_PERIMETER = 4 * Math.sqrt(10.5 * 10.5 * 2)

const props = defineProps<{
  /** Resolved share, `0..1`. Clamped by the component. At exactly `1` the interior is painted solid. */
  completion: number
  /** Draws in the error colour instead of the accent. */
  overdue?: boolean
  /** Edge length in pixels. 12 on a card, 13 in the settings list. */
  size?: number
}>()

const clampedCompletion = computed(() => Math.min(1, Math.max(0, props.completion)))
const isClosed = computed(() => clampedCompletion.value >= 1)
const progressDasharray = computed(() => `${(clampedCompletion.value * DIAMOND_PERIMETER).toFixed(2)} ${DIAMOND_PERIMETER.toFixed(2)}`)
const rootColor = computed(() => (props.overdue ? "var(--color-error)" : "var(--color-accent)"))
</script>

<template>
  <svg :width="size ?? 12" :height="size ?? 12" viewBox="0 0 24 24" :style="{color: rootColor}" aria-hidden="true">
    <path v-if="isClosed" :d="DIAMOND_PATH" fill="currentColor" />
    <path :d="DIAMOND_PATH" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" opacity=".22" />
    <path
      :d="DIAMOND_PATH"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linejoin="round"
      stroke-linecap="round"
      :stroke-dasharray="progressDasharray"
    />
  </svg>
</template>
