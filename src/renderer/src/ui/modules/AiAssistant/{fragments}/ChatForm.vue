<script setup lang="ts">
import {ref} from "vue"

import {AIConfig} from "@shared/types/ai"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import AutoSizeInput from "@/ui/common/inputs/AutoSizeInput.vue"

defineProps<{
  aiConfig: AIConfig["openai"] | AIConfig["local"] | null
  disabled?: boolean
  loading?: boolean
  error?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
  cancel: []
  retry: []
}>()

const message = ref("")

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendRequest()
  }
}

function sendRequest() {
  if (!message.value.trim()) return
  emit("send", message.value)
  message.value = ""
}

function cancelRequest() {
  emit("cancel")
}
</script>

<template>
  <div>
    <div v-if="error" class="flex size-full w-full items-center justify-center">
      <ThinkErrorAICard @retry="emit('retry')" />
    </div>

    <div v-else class="bg-base-200 border-base-300 h-fit w-full rounded-lg border">
      <AutoSizeInput v-model="message" :disabled="disabled || loading" placeholder="Ask me anything..." :max-height="200" @keydown="onKeydown" />

      <div class="flex w-full items-center justify-between gap-2 p-2">
        <span class="text-base-content/80 bg-base-300 rounded-full px-2 py-1 text-xs">
          <BaseIcon name="ai" class="size-4" />
          {{ aiConfig?.model ?? "-" }}
        </span>

        <BaseButton
          variant="secondary"
          size="sm"
          :icon="loading ? 'stop' : 'arrow-up'"
          class="bg-base-content/80 text-base-100 hover:bg-base-content/90 hover:text-base-100 flex aspect-square items-center justify-center rounded-full p-1"
          icon-class="size-4"
          @click="loading ? cancelRequest() : sendRequest()"
        />
      </div>
    </div>
  </div>
</template>
