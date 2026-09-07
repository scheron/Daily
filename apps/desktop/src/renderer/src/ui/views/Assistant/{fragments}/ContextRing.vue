<script setup lang="ts">
import {computed} from "vue"

import {useAiStore} from "@/stores/ai"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import RingChart from "@/ui/common/charts/RingChart.vue"

const aiStore = useAiStore()

const usage = computed(() => aiStore.contextUsage)

const pct = computed(() => {
  const {used, window} = usage.value
  if (!window) return null
  return Math.min(100, Math.round((used / window) * 100))
})

const contextValue = computed(() => {
  const {used, window} = usage.value
  if (!window) return used.toLocaleString()
  return `${used.toLocaleString()} / ${window.toLocaleString()} (${pct.value}%)`
})
</script>

<template>
  <BasePopup v-if="usage.total > 0" hover-mode hide-header position="end">
    <template #trigger="{show}">
      <div class="flex items-center" @mouseenter="show">
        <RingChart :value="usage.window ? usage.used : 0" :max="usage.window ?? 1" :size="18" :thickness="5"><span /></RingChart>
      </div>
    </template>

    <div class="px-1 py-0.5">
      <span class="text-base-content/50 mb-2 block text-[10px] font-semibold tracking-wider uppercase">Usage</span>
      <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-xs">
        <BaseIcon name="monitor" class="text-base-content/40 size-3.5 shrink-0" />
        <span class="text-base-content/70">Context</span>
        <span class="text-base-content font-mono tabular-nums">{{ contextValue }}</span>
      </div>
    </div>
  </BasePopup>
</template>
