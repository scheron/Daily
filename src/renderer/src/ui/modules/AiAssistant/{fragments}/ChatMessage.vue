<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import type {AIMessage} from "@shared/types/ai"

const props = defineProps<{
  message: AIMessage
}>()
const emit = defineEmits<{
  retry: []
}>()

const isUser = computed(() => props.message.role === "user")
</script>

<template>
  <div class="flex gap-3">
    <div class="w-full">
      <div class="flex flex-col items-end gap-1">
        <div class="rounded-lg px-3 py-2" :class="[isUser ? 'text-primary-content bg-base-200 border-base-300 border' : 'text-base-content']">
          <p class="text-sm whitespace-pre-wrap">{{ message.content }}</p>
        </div>
        <BaseButton v-if="isUser" variant="ghost" size="sm" icon="refresh" class="size-6" icon-class="size-4" @click="emit('retry')" />
      </div>

      <div v-if="message.toolCalls?.length">
        <p class="text-base-content/80 mb-1 text-xs">Used:</p>

        <div class="space-y-1">
          <div v-for="(tool, idx) in message.toolCalls" :key="idx" class="bg-base-300/50 border-base-300 rounded border px-2 py-1">
            <div class="text-base-content/60 flex items-center gap-1 text-xs">
              <BaseIcon name="tool" class="size-3" />
              <span class="font-mono">{{ tool.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
