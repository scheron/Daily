<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const emit = defineEmits<{
  retry: []
}>()

function onRetry() {
  emit("retry")
}
</script>

<template>
  <div class="bg-error/10 border-error/20 mx-3 my-3 flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-2">
    <BaseIcon name="alert-triangle" class="text-error size-12" />

    <p class="text-error text-center text-sm">
      Cannot connect to API. <br />
      Check your API key and URL in settings
    </p>
    <BaseButton class="border-error text-error w-full text-sm" size="sm" variant="outline" @click="onRetry"> Reconnect </BaseButton>
  </div>
</template>
