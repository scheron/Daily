<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

defineProps<{
  remoteModels: string[]
}>()

const emit = defineEmits<{
  "go-to-settings": []
  "select-remote-model": [model: string]
}>()
</script>

<template>
  <div class="bg-info/10 border-info/20 mx-3 my-3 flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-3">
    <BaseIcon name="ai" class="text-info size-12" />

    <template v-if="remoteModels.length">
      <p class="text-info text-center text-sm">
        No local model installed. <br />
        Select a remote model to continue.
      </p>

      <div class="flex w-full flex-wrap justify-center gap-1">
        <BaseButton
          v-for="model in remoteModels"
          :key="model"
          class="border-info text-info text-xs"
          size="sm"
          variant="outline"
          @click="emit('select-remote-model', model)"
        >
          {{ model }}
        </BaseButton>
      </div>
    </template>

    <template v-else>
      <p class="text-info text-center text-sm">
        No available models yet. <br />
        Open settings and configure your first AI assistant.
      </p>
      <BaseButton class="border-info text-info w-full text-sm" size="sm" variant="outline" @click="emit('go-to-settings')">
        Go to Settings
      </BaseButton>
    </template>
  </div>
</template>
