<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const emit = defineEmits<{
  "go-to-settings": []
}>()
</script>

<template>
  <div class="bg-info/10 border-info/20 mx-3 my-3 flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-2">
    <BaseIcon name="ai" class="text-info size-12" />

    <p class="text-info text-center text-sm">
      No local model installed. <br />
      Download a model in settings to start chatting.
    </p>
    <BaseButton class="border-info text-info w-full text-sm" size="sm" variant="outline" @click="emit('go-to-settings')"> Go to Settings </BaseButton>
  </div>
</template>
