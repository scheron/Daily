<script setup lang="ts">
import {onMounted} from "vue"

import {useFocusStore} from "@/stores/focus.store"
import {useThemeStore} from "@/stores/theme"
import BaseButton from "@/ui/base/BaseButton"
import FocusPanel from "@/ui/common/focus/FocusPanel"

const focusStore = useFocusStore()
useThemeStore()

onMounted(() => {
  window.BridgeIPC.send("window:ready")
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col overflow-hidden">
    <header class="border-base-300 drag-region relative flex h-9 shrink-0 items-center justify-end border-b pr-2 select-none">
      <span class="text-base-content/70 pointer-events-none absolute inset-x-0 text-center text-sm font-semibold">Focus session</span>
      <BaseButton
        variant="ghost-muted"
        size="sm"
        icon="minimize"
        tooltip="Attach to the main window"
        class="[-webkit-app-region:no-drag]"
        @click="focusStore.dispatch({type: 'attach'})"
      />
    </header>

    <FocusPanel v-if="focusStore.session" :session="focusStore.session" />
  </div>
</template>
