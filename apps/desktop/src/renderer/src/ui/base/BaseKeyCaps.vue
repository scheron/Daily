<script setup lang="ts">
defineProps<{
  /** One cap per key, already in display form — `["⌘", "↵"]`. */
  keys: string[]
}>()
</script>

<template>
  <span class="flex shrink-0 items-center gap-1">
    <kbd
      v-for="(key, index) in keys"
      :key="index"
      class="border-base-300 bg-base-200 text-base-content/70 inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 font-mono text-[11px]"
    >
      {{ key }}
    </kbd>
  </span>
</template>
