<script setup lang="ts">
import {computed, nextTick, onMounted, useTemplateRef, watch} from "vue"
import {toasts} from "vue-toasts-lite"
import {until} from "@vueuse/core"

import {AIProvider} from "@shared/types/ai"
import {toDateLabel} from "@shared/utils/date/formatters"
import {useAiStore} from "@/stores/ai"
import {useThemeStore} from "@/stores/theme.store"
import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useStickToBottom} from "@/composables/useStickToBottom"
import {useTyping} from "@/composables/useTyping"
import {getProviderConfig} from "@/utils/ai/getProviderConfig"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import WaveText from "@/ui/common/misc/WaveText.vue"

import ConnectionErrorAICard from "./{fragments}/cards/ConnectionErrorAICard.vue"
import DisabledAICard from "./{fragments}/cards/DisabledAICard.vue"
import NoLocalModelAICard from "./{fragments}/cards/NoLocalModelAICard.vue"
import OnboardingAICard from "./{fragments}/cards/OnboardingAICard.vue"
import ThinkErrorAICard from "./{fragments}/cards/ThinkErrorAICard.vue"
import ToolConfirmationCard from "./{fragments}/cards/ToolConfirmationCard.vue"
import ChatForm from "./{fragments}/ChatForm.vue"
import ChatMessage from "./{fragments}/ChatMessage.vue"

useThemeStore()
const aiStore = useAiStore()
const {copyToClipboard, isCopied: isConversationCopied} = useCopyToClipboard({onSuccess: () => toasts.success("Conversation copied")})
const {startTyping, stopTyping, renderTyping} = useTyping({duration: 80, endDelay: 1500})

const messagesContainerRef = useTemplateRef<HTMLElement>("messagesContainer")
const {isAwayFromBottom, scrollToBottom} = useStickToBottom(messagesContainerRef)

const aiConfig = computed(() => (aiStore.config ? getProviderConfig(aiStore.config.provider, aiStore.config) : null))
const activeProvider = computed(() => aiStore.config?.provider ?? "openai")
const activeModel = computed(() => {
  if (!aiStore.config) return ""
  if (aiStore.config.provider === "openai") return aiStore.config.openai?.model ?? ""
  return aiStore.config.local?.model ?? ""
})

const installedLocalModels = computed(() => aiStore.installedLocalModels)
const isNoLocalModel = computed(() => aiStore.config?.provider === "local" && installedLocalModels.value.length === 0)

const retryableMessageId = computed(() => {
  if (aiStore.isThinkLoading) return null

  const last = aiStore.messages.at(-1)
  if (last?.role === "user") return last.id
  return null
})

const showThinkingSpinner = computed(() => {
  if (!aiStore.isThinkLoading) return false
  const last = aiStore.messages.at(-1)
  if (!last || last.role === "user") return true
  if (last.status === "streaming") {
    const hasContent = (last.content?.length ?? 0) > 0
    const hasSegment = (last.segments?.length ?? 0) > 0
    return !hasContent && !hasSegment
  }
  return false
})

function copyConversation() {
  const text = aiStore.messages.map((message) => `**${message.role === "user" ? "You" : "Assistant"}:** ${message.content}`).join("\n\n")
  copyToClipboard(text)
}

async function handleSelectModel(provider: AIProvider, model: string) {
  await aiStore.selectModel(provider, model)
}

async function handleSelectRemoteModel(model: string) {
  await aiStore.selectModel("openai", model)
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

onMounted(async () => {
  window.BridgeIPC.send("window:ready")
  aiStore.loadLocalModels()
  await until(messagesContainerRef).toBeTruthy()
  await nextTick()
  scrollToBottom()
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col overflow-hidden">
    <header class="h-header grid shrink-0 grid-cols-[1fr_auto_1fr] items-center select-none" style="-webkit-app-region: drag">
      <div></div>
      <span v-if="aiStore.chatTimeStarted && aiStore.hasMessages" class="text-base-content/70 text-sm">
        {{ toDateLabel(aiStore.chatTimeStarted) }}
      </span>
      <span v-else></span>
      <div v-if="aiStore.hasMessages" class="flex items-center justify-end gap-1 pr-3" style="-webkit-app-region: no-drag">
        <BaseButton
          variant="ghost"
          size="sm"
          :icon="isConversationCopied ? 'check' : 'copy'"
          icon-class="size-4"
          tooltip="Copy conversation"
          @click="copyConversation"
        />
        <BaseButton variant="ghost" size="sm" icon="trash" icon-class="size-4" tooltip="Clear chat" @click="aiStore.clearHistory" />
      </div>
      <div v-else></div>
    </header>
    <div class="min-h-0 flex-1">
      <div class="flex h-full flex-col">
        <template v-if="aiStore.isConnectionLoading">
          <div class="flex h-full flex-col items-center justify-center">
            <div class="text-base-content/60 relative flex w-full items-center justify-center">
              <BaseIcon name="logo" class="size-16 animate-pulse" />
              <h3 class="text-base-content absolute bottom-0 left-1/2 mb-2 -translate-x-1/2 translate-y-12 text-base font-light">
                {{ renderTyping("Connecting to AI...") }}
              </h3>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="aiStore.isDisabled" class="flex size-full w-full items-center justify-center">
            <DisabledAICard />
          </div>
          <div v-else-if="aiStore.isConnectionError && isNoLocalModel" class="flex size-full w-full items-center justify-center">
            <NoLocalModelAICard :remote-models="aiStore.remoteModels" @select-remote-model="handleSelectRemoteModel" />
          </div>
          <div v-else-if="aiStore.isConnectionError" class="flex size-full w-full items-center justify-center">
            <ConnectionErrorAICard @retry="aiStore.checkConnection" />
          </div>

          <template v-else>
            <OnboardingAICard v-if="!aiStore.hasMessages" />

            <div v-else class="relative min-h-0 flex-1">
              <div ref="messagesContainer" class="h-full space-y-5 overflow-y-auto px-4 pt-3 pb-10">
                <ChatMessage
                  v-for="(msg, idx) in aiStore.messages"
                  :key="msg.id"
                  :message="msg"
                  :can-retry="msg.id === retryableMessageId"
                  :is-last="idx === aiStore.messages.length - 1"
                  :preceding-is-user="aiStore.messages[idx - 1]?.role === 'user'"
                  @retry="aiStore.retryMessage"
                />

                <ToolConfirmationCard
                  v-if="aiStore.pendingConfirmation"
                  :confirmation="aiStore.pendingConfirmation"
                  @confirm="aiStore.confirmPendingToolCall"
                  @cancel="aiStore.cancelPendingToolCall"
                />

                <ThinkErrorAICard v-if="aiStore.isThinkError && retryableMessageId" @retry="aiStore.retryMessage" />

                <div v-if="showThinkingSpinner" class="flex items-start gap-3">
                  <div class="text-base-content/60 pt-1 text-sm">
                    <WaveText text="Thinking..." />
                  </div>
                </div>
              </div>

              <button
                v-if="isAwayFromBottom"
                type="button"
                class="bg-base-200 border-base-300 text-base-content/70 hover:text-base-content absolute right-4 bottom-3 flex size-8 items-center justify-center rounded-full border shadow-sm transition-colors"
                @click="scrollToBottom"
              >
                <BaseIcon name="chevron-down" class="size-4" />
              </button>
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
    </div>
  </div>
</template>
