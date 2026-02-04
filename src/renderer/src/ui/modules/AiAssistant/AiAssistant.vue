<script setup lang="ts">
import {computed, nextTick, onMounted, useTemplateRef, watch} from "vue"
import {until} from "@vueuse/core"

import {toFullDate} from "@shared/utils/date/formatters"
import {useAiStore} from "@/stores/ai.store"
import {useTyping} from "@/composables/useTyping"
import {getProviderConfig} from "@/utils/ai/getProviderConfig"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import ConnectionErrorAICard from "./{fragments}/cards/ConnectionErrorAICard.vue"
import DisabledAICard from "./{fragments}/cards/DisabledAICard.vue"
import OnboardingAICard from "./{fragments}/cards/OnboardingAICard.vue"
import ChatForm from "./{fragments}/ChatForm.vue"
import ChatMessage from "./{fragments}/ChatMessage.vue"

const aiStore = useAiStore()
const {startTyping, stopTyping, renderTyping} = useTyping({duration: 80, endDelay: 1500})

const messagesContainerRef = useTemplateRef<HTMLElement>("messagesContainer")

const aiConfig = computed(() => (aiStore.config ? getProviderConfig(aiStore.config.provider, aiStore.config) : null))

function scrollToBottom() {
  if (!messagesContainerRef.value) return
  messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
}

watch(
  () => aiStore.isConnectionLoading,
  (newVal) => {
    if (newVal) {
      startTyping("Connecting to AI...")
    } else {
      stopTyping()
    }
  },
)

watch(
  () => [aiStore.messages.length, aiStore.isThinkLoading],
  async () => {
    await nextTick()
    scrollToBottom()
  },
)
onMounted(async () => {
  await until(messagesContainerRef).toBeTruthy()
  await nextTick()
  scrollToBottom()
})
</script>

<template>
  <div class="flex h-full flex-col">
    <template v-if="aiStore.isConnectionLoading">
      <div class="flex h-full flex-col items-center justify-center">
        <div class="text-base-content/60 relative flex w-full items-center justify-center">
          <BaseIcon name="ai" class="size-16 animate-pulse" />
          <h3 class="text-base-content absolute bottom-0 left-1/2 mb-2 -translate-x-1/2 translate-y-12 text-base font-light">
            {{ renderTyping("Connecting to AI...") }}
          </h3>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="aiStore.chatTimeStarted && aiStore.hasMessages" class="h-header flex items-center justify-between px-4 py-1 text-sm">
        <span class="text-base-content/80 flex-1 rounded-md px-2 py-1 text-sm">{{ toFullDate(aiStore.chatTimeStarted) }}</span>
        <BaseButton variant="ghost" size="sm" icon="x-mark" class="" tooltip="Clear chat" @click="aiStore.clearHistory" />
      </div>

      <div v-if="aiStore.isDisabled" class="flex size-full w-full items-center justify-center">
        <DisabledAICard />
      </div>
      <div v-else-if="aiStore.isConnectionError" class="flex size-full w-full items-center justify-center">
        <ConnectionErrorAICard @retry="aiStore.checkConnection" />
      </div>

      <template v-else>
        <OnboardingAICard v-if="!aiStore.hasMessages" />

        <div v-else ref="messagesContainer" class="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <ChatMessage v-for="msg in aiStore.messages" :key="msg.id" :message="msg" @retry="aiStore.retryMessage" />

          <div v-if="aiStore.isThinkLoading" class="my-8 flex items-start gap-3">
            <div class="bg-base-200 text-base-content/60 rounded-lg px-3 py-2 text-sm">
              {{ renderTyping("Thinking...") }}
            </div>
          </div>
        </div>

        <ChatForm
          v-focus-on-mount
          :ai-config="aiConfig"
          :loading="aiStore.isThinkLoading"
          :error="aiStore.isThinkError"
          class="flex w-full items-center justify-between px-4 py-3"
          @send="aiStore.sendMessage"
          @retry="aiStore.retryMessage"
          @cancel="aiStore.cancelRequest"
        />
      </template>
    </template>
  </div>
</template>
