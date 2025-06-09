<script setup lang="ts">
defineProps<{opacity: number; shouldActionTrigger: boolean}>()
</script>

<template>
  <div class="absolute inset-0 flex items-center px-3 transition-colors duration-300 md:px-4" :style="{opacity}">
    <div
      :class="shouldActionTrigger ? 'scale-100 opacity-100' : 'scale-90 opacity-0'"
      class="flex h-full items-center justify-center transition-all duration-300"
    >
      <slot />
    </div>
  </div>
</template>
