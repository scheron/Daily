<script setup lang="ts">
defineProps<{
  label: string
  disabled?: boolean
}>()
</script>

<template>
  <div class="flex min-h-8 items-start gap-3 py-0.5" :class="{'pointer-events-none opacity-40': disabled}">
    <span class="text-base-content/50 mt-1 w-24 shrink-0 text-sm leading-none">{{ label }}</span>

    <div class="min-w-0 flex-1 text-sm">
      <slot />
    </div>
  </div>
</template>
