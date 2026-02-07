<script setup lang="ts">
import {computed, nextTick, onMounted, useTemplateRef, watch} from "vue"
import {until} from "@vueuse/core"

import {toFullDate} from "@shared/utils/date/formatters"
import {useAiStore} from "@/stores/ai.store"
import {useLocalModelStore} from "@/stores/localModel.store"
import {useTyping} from "@/composables/useTyping"
import {getProviderConfig} from "@/utils/ai/getProviderConfig"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import WaveText from "@/ui/common/misc/WaveText.vue"

import ConnectionErrorAICard from "./{fragments}/cards/ConnectionErrorAICard.vue"
import DisabledAICard from "./{fragments}/cards/DisabledAICard.vue"
import OnboardingAICard from "./{fragments}/cards/OnboardingAICard.vue"
import ThinkErrorAICard from "./{fragments}/cards/ThinkErrorAICard.vue"
import ChatForm from "./{fragments}/ChatForm.vue"
import ChatMessage from "./{fragments}/ChatMessage.vue"

import type {AIProvider} from "@shared/types/ai"

const aiStore = useAiStore()
const localModelStore = useLocalModelStore()
const {startTyping, stopTyping, renderTyping} = useTyping({duration: 80, endDelay: 1500})

const messagesContainerRef = useTemplateRef<HTMLElement>("messagesContainer")

const aiConfig = computed(() => (aiStore.config ? getProviderConfig(aiStore.config.provider, aiStore.config) : null))
const activeProvider = computed(() => aiStore.config?.provider ?? "openai")
const activeModel = computed(() => {
  if (!aiStore.config) return ""
  if (aiStore.config.provider === "openai") return aiStore.config.openai?.model ?? ""
  return aiStore.config.local?.model ?? ""
})

const installedLocalModels = computed(() => localModelStore.installedModels)

/** Last user message can be retried if it has no assistant response, not loading, and no error */
const retryableMessageId = computed(() => {
  if (aiStore.isThinkLoading || aiStore.isThinkError) return null
  const last = aiStore.messages.at(-1)
  if (last?.role === "user") return last.id
  return null
})

function scrollToBottom() {
  if (!messagesContainerRef.value) return
  messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
}

async function handleSelectModel(provider: AIProvider, model: string) {
  await aiStore.selectModel(provider, model)
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
  () => [aiStore.messages.length, aiStore.isThinkLoading, aiStore.isThinkError],
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

onMounted(async () => {
  localModelStore.loadModels()
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

        <div v-else ref="messagesContainer" class="flex-1 space-y-5 overflow-y-auto px-4 py-3">
          <ChatMessage
            v-for="msg in aiStore.messages"
            :key="msg.id"
            :message="msg"
            :can-retry="msg.id === retryableMessageId"
            @retry="aiStore.retryMessage"
          />

          <ThinkErrorAICard v-if="aiStore.isThinkError && retryableMessageId" @retry="aiStore.retryMessage" />

          <div v-if="aiStore.isThinkLoading" class="flex items-start gap-3">
            <div class="text-base-content/60 pt-1 text-sm">
              <WaveText text="Thinking..." />
            </div>
          </div>
        </div>

        <ChatForm
          v-focus-on-mount
          :ai-config="aiConfig"
          :active-provider="activeProvider"
          :active-model="activeModel"
          :local-models="installedLocalModels"
          :remote-models="aiStore.remoteModels"
          :loading="aiStore.isThinkLoading"
          class="flex w-full items-center justify-between px-4 py-3"
          @send="aiStore.sendMessage"
          @cancel="aiStore.cancelRequest"
          @select-model="handleSelectModel"
        />
      </template>
    </template>
  </div>
</template>
