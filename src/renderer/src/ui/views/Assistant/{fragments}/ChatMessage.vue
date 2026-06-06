<script setup lang="ts">
import {computed, ref} from "vue"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useAiStore} from "@/stores/ai/ai.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import ChatMarkdown from "./ChatMarkdown.vue"
import MessageReasoning from "./MessageReasoning.vue"
import ToolCallCard from "./ToolCallCard.vue"

import type {AIMessage} from "@shared/types/ai"

const props = defineProps<{
  message: AIMessage
  canRetry?: boolean
  isLast?: boolean
  precedingIsUser?: boolean
}>()
defineEmits<{
  retry: []
}>()

const aiStore = useAiStore()

const isUser = computed(() => props.message.role === "user")
const hasToolCalls = computed(() => (props.message.toolCalls?.length ?? 0) > 0)
const toolsExpanded = ref(false)

const formattedTime = computed(() => toLocaleTime(props.message.timestamp))

const isStreaming = computed(() => props.message.status === "streaming")
const isStreamingSegmentIdx = computed(() => {
  if (!isStreaming.value) return -1
  return (props.message.segments?.length ?? 0) - 1
})
const hasFinalContent = computed(() => (props.message.content?.length ?? 0) > 0)
const canRetryFailed = computed(() => props.message.status === "failed" && props.isLast && props.precedingIsUser)
</script>

<template>
  <div class="flex" :class="[isUser ? 'justify-end' : 'justify-start']">
    <div v-if="!isUser" class="flex w-full gap-3">
      <div class="min-w-0 flex-1">
        <div class="ai-message-content flex flex-col gap-2 text-sm select-text">
          <!-- Streaming segments path -->
          <template v-if="message.segments?.length">
            <template v-for="(seg, idx) in message.segments" :key="idx">
              <MessageReasoning
                v-if="seg.kind === 'reasoning'"
                :text="seg.text"
                :duration-ms="seg.durationMs"
                :streaming="isStreaming && idx === isStreamingSegmentIdx"
                :collapsed="hasFinalContent"
              />
              <ToolCallCard v-else-if="seg.kind === 'tool'" :segment="seg" />
            </template>
          </template>

          <!-- Legacy path: pre-streaming turns with flat tool call list -->
          <template v-else-if="hasToolCalls">
            <BaseButton
              variant="text"
              class="text-base-content/40 hover:text-base-content/60 flex items-center gap-1 p-0 text-xs transition-colors"
              @click="toolsExpanded = !toolsExpanded"
            >
              <BaseIcon name="tool" class="size-3" />
              <span>{{ message.toolCalls!.length }} tool{{ message.toolCalls!.length > 1 ? "s" : "" }} used</span>
              <BaseIcon name="chevron-down" class="size-3 transition-transform" :class="{'rotate-180': toolsExpanded}" />
            </BaseButton>

            <div v-if="toolsExpanded" class="mt-1.5 space-y-1">
              <div v-for="(tool, tIdx) in message.toolCalls" :key="tIdx" class="bg-base-300/30 border-base-300/50 rounded border px-2 py-1">
                <div class="text-base-content/50 flex items-center gap-1 text-xs">
                  <BaseIcon name="tool" class="size-3" />
                  <span class="font-mono">{{ tool.name }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- Content area (both streaming and completed) -->
          <ChatMarkdown v-if="message.content" :text="message.content" />

          <!-- Cancelled state -->
          <p v-if="message.status === 'cancelled'" class="text-base-content/50 text-xs italic">Generation stopped.</p>

          <!-- Failed state -->
          <template v-else-if="message.status === 'failed'">
            <p class="text-error text-xs">{{ message.error ?? "Failed" }}</p>
            <BaseButton v-if="canRetryFailed" variant="ghost" size="sm" icon="refresh" class="self-start" @click="aiStore.retryMessage">
              Retry
            </BaseButton>
          </template>
        </div>

        <span v-if="!isStreaming" class="text-base-content/30 mt-1 block text-[10px]">{{ formattedTime }}</span>
      </div>
    </div>

    <div v-else class="max-w-[85%]">
      <div class="bg-base-200 border-base-300 rounded-2xl rounded-br-sm border px-3.5 py-2">
        <p class="text-sm whitespace-pre-wrap select-text">{{ message.content }}</p>
      </div>
      <div class="mt-1 flex items-center justify-end gap-1.5">
        <BaseButton
          v-if="canRetry"
          variant="text"
          icon="refresh"
          icon-class="size-3.5"
          class="text-base-content/30 hover:text-base-content/60 cursor-pointer p-0 transition-colors"
          @click="$emit('retry')"
        />
        <span class="text-base-content/30 text-[10px]">{{ formattedTime }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-message-content :deep(.cm-editor) {
  background-color: transparent;
}

.ai-message-content :deep(.cm-content) {
  padding: 0;
}

.ai-message-content :deep(.cm-scroller) {
  overflow: visible;
}

.ai-message-content :deep(.cm-line) {
  padding-left: 0;
}
</style>
