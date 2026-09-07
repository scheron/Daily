<script setup lang="ts">
defineProps<{
  title?: string
  badge?: string
  description?: string
}>()
</script>

<template>
  <div class="border-base-300 bg-base-200/60 flex items-start justify-between gap-2 rounded-lg border p-3">
    <div class="flex-1">
      <p class="text-base-content flex items-center gap-2 text-sm">
        <slot name="title">
          <span>{{ title }}</span>
        </slot>
        <span
          v-if="badge"
          class="text-base-content/65 border-base-content/25 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
        >
          {{ badge }}
        </span>
      </p>
      <slot name="description">
        <p class="text-base-content/60 text-xs">{{ description }}</p>
      </slot>
    </div>

    <slot />
  </div>
</template>
