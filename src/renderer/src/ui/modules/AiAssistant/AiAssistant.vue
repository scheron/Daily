<script setup lang="ts">
import {computed, nextTick, onMounted, ref, useTemplateRef, watch} from "vue"
import {until} from "@vueuse/core"

import {ISODate} from "@shared/types/common"
import {toFullDate, toLocaleDate} from "@shared/utils/date/formatters"
import {useAiStore} from "@/stores/ai.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useTyping} from "@/composables/useTyping"
import {getProviderConfig} from "@/utils/ai/getProviderCOnfig"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import ChatForm from "./{fragments}/ChatForm.vue"
import ChatMessage from "./{fragments}/ChatMessage.vue"

const aiStore = useAiStore()
const settingsStore = useSettingsStore()
const {startTyping, stopTyping, renderTyping} = useTyping({duration: 80})

const messagesContainerRef = useTemplateRef<HTMLElement>("messagesContainer")

const aiConfig = computed(() => {
  return settingsStore.settings?.ai ? getProviderConfig(settingsStore.settings.ai.provider, settingsStore.settings.ai) : null
})

function scrollToBottom() {
  if (!messagesContainerRef.value) return
  messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
}

watch(
  () => aiStore.isLoading,
  (newVal) => {
    if (newVal) {
      startTyping("Connecting to AI...")
    } else {
      stopTyping()
    }
  },
)

watch(
  () => [aiStore.messages.length, aiStore.isThinkingLoading],
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
    <template v-if="aiStore.isLoading">
      <div class="flex h-full flex-col items-center justify-center">
        <div class="text-base-content/60 mb-6 animate-pulse">
          <BaseIcon name="ai" class="size-16" />
        </div>
        <h3 class="text-base-content mb-2 text-base font-light">{{ renderTyping("Connecting to AI...") }}</h3>
      </div>
    </template>

    <template v-else>
      <div v-if="aiStore.chatTimeStarted && aiStore.hasMessages" class="h-header flex items-center justify-between px-4 py-1 text-sm">
        <span class="text-base-content/80 flex-1 rounded-md px-2 py-1 text-sm">{{ toFullDate(aiStore.chatTimeStarted) }}</span>
        <BaseButton variant="ghost" size="sm" icon="x-mark" class="" tooltip="Clear chat" @click="aiStore.clearHistory" />
      </div>

      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-3">
        <div class="flex h-full flex-col">
          <div v-if="!aiStore.hasMessages && aiStore.isConnected" class="mx-5 flex h-full flex-col items-center justify-center">
            <div class="text-base-content/40 mb-6"><BaseIcon name="sparkles" class="size-16" /></div>
            <h3 class="text-base-content mb-2 text-lg font-medium">How can I help?</h3>
            <p class="text-base-content/60 mb-6 max-w-xs text-center text-sm">
              I can help you manage your tasks. Ask me to create, update, or list your tasks.
            </p>
            <div class="flex justify-center gap-2">
              <BaseButton
                variant="primary"
                class="bg-accent/10 hover:bg-accent/20 shrink-0 text-xs"
                size="sm"
                @click="aiStore.sendMessage('What tasks do I have today?')"
              >
                📋 Today's tasks
              </BaseButton>
              <BaseButton
                variant="primary"
                class="bg-accent/10 hover:bg-accent/20 shrink-0 text-xs"
                size="sm"
                @click="aiStore.sendMessage('Give me a summary of the current week')"
              >
                ✨ Weekly summary
              </BaseButton>
            </div>
          </div>

          <div v-else class="space-y-6">
            <ChatMessage v-for="msg in aiStore.messages" :key="msg.id" :message="msg" @retry="aiStore.retryMessage" />

            <div v-if="aiStore.isThinkingLoading" class="my-8 flex items-start gap-3">
              <div class="bg-base-200 text-base-content/60 rounded-lg px-3 py-2 text-sm">
                {{ renderTyping("Thinking...") }}
              </div>
            </div>
            <div v-if="aiStore.isThinkError" class="my-8 flex items-start gap-3">
              <div class="bg-error/10 text-error rounded-lg px-3 py-2 text-sm">
                <p class="text-error text-xs">Failed to generate response. Please try again.</p>
                <BaseButton variant="ghost" size="sm" icon="refresh" class="text-error hover:bg-error/10 mt-2 w-full" @click="aiStore.retryMessage">
                  Retry
                </BaseButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="aiStore.isError || !aiStore.isConnected" class="bg-error/10 border-error/20 mx-3 my-3 rounded-lg border px-4 py-2">
        <div class="mb-2 flex items-center gap-2">
          <BaseIcon name="alert-triangle" class="text-error size-4" />
          <p class="text-error text-xs">
            Cannot connect to API. <br />
            Check your API key and URL in settings
          </p>
        </div>
        <BaseButton class="border-error text-error w-full py-0.5 text-xs" size="sm" variant="outline" @click="aiStore.checkConnection">
          Try to Reconnect
        </BaseButton>
      </div>

      <ChatForm
        v-else
        v-focus-on-mount
        :ai-config="aiConfig"
        :loading="aiStore.isThinkingLoading"
        class="flex w-full items-center justify-between px-4 py-3"
        @send="aiStore.sendMessage"
        @cancel="aiStore.cancelRequest"
      />
    </template>
  </div>
</template>
