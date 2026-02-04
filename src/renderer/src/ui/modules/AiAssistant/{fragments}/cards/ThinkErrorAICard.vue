<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"

const emit = defineEmits<{
  retry: []
}>()

function onRetry() {
  emit("retry")
}
</script>

<template>
  <div class="bg-error/10 text-error rounded-lg px-3 py-2 text-sm">
    <p class="text-error text-center text-xs">Failed to generate response. Please try again.</p>
    <BaseButton variant="ghost" size="sm" icon="refresh" class="text-error hover:bg-error/10 mt-2 w-full" @click="onRetry"> Retry </BaseButton>
  </div>
</template>
