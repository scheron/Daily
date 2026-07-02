<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useAiStore} from "@/stores/ai"
import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import BaseButton from "@/ui/base/BaseButton"

import ToolCallGroup from "./cards/ToolCallGroup.vue"
import ChatMarkdown from "./ChatMarkdown.vue"
import MessageReasoning from "./MessageReasoning.vue"

import type {AgentMessageSegment, AIMessage} from "@shared/types/ai"

type ReasoningSegment = Extract<AgentMessageSegment, {kind: "reasoning"}>
type ToolSegment = Extract<AgentMessageSegment, {kind: "tool"}>
type SegmentBlock = {kind: "reasoning"; segment: ReasoningSegment} | {kind: "tools"; tools: ToolSegment[]}

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
const {copyToClipboard, isCopied: isMessageCopied} = useCopyToClipboard({onSuccess: () => toasts.success("Message copied")})

const isUser = computed(() => props.message.role === "user")
const isStreaming = computed(() => props.message.status === "streaming")
const hasFinalContent = computed(() => (props.message.content?.length ?? 0) > 0)
const canRetryFailed = computed(() => props.message.status === "failed" && props.isLast && props.precedingIsUser)
const formattedTime = computed(() => toLocaleTime(props.message.timestamp))

const blocks = computed<SegmentBlock[]>(() => {
  const out: SegmentBlock[] = []
  for (const seg of props.message.segments ?? []) {
    if (seg.kind === "tool") {
      const last = out.at(-1)
      if (last?.kind === "tools") last.tools.push(seg)
      else out.push({kind: "tools", tools: [seg]})
    } else {
      out.push({kind: "reasoning", segment: seg})
    }
  }
  return out
})

function copyMessage() {
  copyToClipboard(props.message.content)
}
</script>

<template>
  <div class="flex" :class="[isUser ? 'justify-end' : 'justify-start']">
    <div v-if="!isUser" class="group flex w-full gap-3">
      <div class="min-w-0 flex-1">
        <div class="ai-message-content flex flex-col gap-2 text-sm select-text">
          <template v-for="(block, i) in blocks" :key="i">
            <MessageReasoning
              v-if="block.kind === 'reasoning'"
              :text="block.segment.text"
              :duration-ms="block.segment.durationMs"
              :streaming="isStreaming && i === blocks.length - 1"
              :collapsed="hasFinalContent"
            />
            <ToolCallGroup v-else :tools="block.tools" :streaming="isStreaming && i === blocks.length - 1" />
          </template>

          <ChatMarkdown v-if="message.content" :text="message.content" />

          <p v-if="message.status === 'cancelled'" class="text-base-content/50 text-xs italic">Generation stopped.</p>

          <template v-else-if="message.status === 'failed'">
            <p class="text-error text-xs">{{ message.error ?? "Failed" }}</p>
            <BaseButton v-if="canRetryFailed" variant="ghost" size="sm" icon="refresh" class="self-start" @click="aiStore.retryMessage">
              Retry
            </BaseButton>
          </template>
        </div>

        <div v-if="!isStreaming" class="mt-1 flex items-center gap-1.5">
          <span class="text-base-content/30 text-[10px]">{{ formattedTime }}</span>
          <BaseButton
            v-if="hasFinalContent"
            variant="text"
            :icon="isMessageCopied ? 'check' : 'copy'"
            icon-class="size-3"
            tooltip="Copy"
            class="text-base-content/30 hover:text-base-content/60 p-0 opacity-0 transition group-hover:opacity-100"
            @click="copyMessage"
          />
        </div>
      </div>
    </div>

    <div v-else class="group max-w-[85%]">
      <div class="bg-base-200 border-base-300 rounded-2xl rounded-br-sm border px-3.5 py-2">
        <p class="text-sm break-words whitespace-pre-wrap select-text">{{ message.content }}</p>
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
        <BaseButton
          variant="text"
          icon="copy"
          icon-class="size-3"
          tooltip="Copy"
          class="text-base-content/30 hover:text-base-content/60 p-0 opacity-0 transition group-hover:opacity-100"
          @click="copyMessage"
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
