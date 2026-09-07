<script setup lang="ts" generic="T extends string">
defineProps<{
  /** Selectable options rendered left-to-right as a single segmented control. */
  options: {value: T; label: string}[]
}>()

const model = defineModel<T>({required: true})
</script>

<template>
  <div class="bg-base-300 inline-flex items-center gap-0.5 rounded-md p-0.5 text-xs">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="focus-visible-accent cursor-pointer rounded px-2.5 py-1 transition-colors outline-none"
      :class="model === opt.value ? 'bg-accent text-base-100' : 'text-base-content/60 hover:text-base-content'"
      @click="model = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
