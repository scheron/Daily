<script setup lang="ts">
import {onMounted} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import {useDevice} from "@/composables/useDevice"
import AiAssistant from "@/ui/modules/AiAssistant"

useThemeStore()

const {isMacOS} = useDevice()

onMounted(() => {
  window.BridgeIPC.send("window:ready")
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col overflow-hidden">
    <header class="h-10 shrink-0 select-none" style="-webkit-app-region: drag" :class="{'pl-16': isMacOS}" />
    <div class="min-h-0 flex-1">
      <AiAssistant class="h-full" />
    </div>
  </div>
</template>
