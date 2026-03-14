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
    <div class="mt-2 flex justify-center">
      <BaseButton variant="ghost" size="sm" icon="refresh" tooltip="Retry" class="text-error hover:bg-error/10 size-7 p-0" @click="onRetry" />
    </div>
  </div>
</template>
