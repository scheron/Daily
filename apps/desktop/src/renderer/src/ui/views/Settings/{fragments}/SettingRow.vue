<script setup lang="ts">
defineProps<{
  /** Primary label for the setting. */
  title?: string
  /** Secondary helper text shown under the title. */
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col gap-3 py-2">
    <div class="flex items-start justify-between gap-10">
      <div class="flex max-w-2/3 flex-1 flex-col gap-0.5">
        <slot name="title">
          <p class="text-base-content text-sm">{{ title }}</p>
        </slot>
        <slot name="description">
          <p v-if="description" class="text-base-content/60 text-xs">{{ description }}</p>
        </slot>
      </div>
      <div class="shrink-0">
        <slot />
      </div>
    </div>
    <slot name="below" />
  </div>
</template>
