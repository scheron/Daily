<script setup lang="ts">
import {onMounted, onUnmounted, ref, watch} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import WaveText from "@/ui/common/misc/WaveText.vue"

import ChatMarkdown from "./ChatMarkdown.vue"

const props = defineProps<{text: string; durationMs?: number; streaming?: boolean; collapsed?: boolean}>()

const isOpen = ref(true)
const liveSeconds = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
const startedAt = Date.now()

function startTimer() {
  if (timer) return
  timer = setInterval(() => {
    liveSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
  }, 1000)
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  if (props.streaming) startTimer()
})
onUnmounted(stopTimer)

watch(
  () => props.streaming,
  (s, prev) => {
    if (s) startTimer()
    else stopTimer()
    // Auto-collapse the moment this segment stops streaming (next segment took over).
    if (prev === true && s === false) isOpen.value = false
  },
)

watch(
  () => props.collapsed,
  (c) => {
    if (c) isOpen.value = false
  },
)
</script>

<template>
  <div class="border-base-300 rounded border-l-2 py-1 pl-3">
    <button
      class="text-base-content/50 hover:text-base-content/70 flex items-center gap-1 text-xs font-medium"
      type="button"
      @click="isOpen = !isOpen"
    >
      <BaseIcon name="chevron-right" class="size-3 transition-transform" :class="{'rotate-90': isOpen}" />
      <WaveText v-if="streaming" text="Thinking" />
      <span v-else>Thinking</span>
      <span v-if="streaming" class="text-base-content/40">· {{ liveSeconds }}s</span>
      <span v-else-if="durationMs" class="text-base-content/40">· {{ Math.round(durationMs / 1000) }}s</span>
    </button>
    <ChatMarkdown v-if="isOpen" :text="text" class="text-base-content/50 mt-1 max-h-64 overflow-auto text-xs" />
  </div>
</template>
