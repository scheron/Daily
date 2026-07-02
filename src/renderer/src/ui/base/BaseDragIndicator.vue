<script setup lang="ts">
defineProps<{
  /** Resize axis: `horizontal` renders an ew-resize vertical bar, `vertical` an ns-resize horizontal bar */
  variant: "horizontal" | "vertical"
  /** Highlights the handle while a drag is in progress */
  active?: boolean
}>()
</script>

<template>
  <div
    role="separator"
    :aria-orientation="variant === 'horizontal' ? 'vertical' : 'horizontal'"
    class="group flex shrink-0 touch-none items-center justify-center"
    :class="variant === 'horizontal' ? 'w-2.5 cursor-ew-resize' : 'h-2.5 cursor-ns-resize'"
  >
    <div
      class="bg-base-300 transition-colors duration-150"
      :class="[
        variant === 'horizontal' ? 'group-hover:bg-base-content/40 h-full w-px' : 'group-hover:bg-base-content/40 h-px w-full',
        {'bg-accent!': active},
      ]"
    />
  </div>
</template>
