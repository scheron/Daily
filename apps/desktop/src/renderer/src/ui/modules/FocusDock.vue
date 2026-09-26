<script setup lang="ts">
import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {useFocusStore} from "@/stores/focus.store"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import FocusPanel from "@/ui/common/focus/FocusPanel"

const uiStore = useUIStore()
const focusStore = useFocusStore()

const {session} = storeToRefs(focusStore)

const isCollecting = computed(() => session.value?.phase === "collect")
const isDetached = computed(() => session.value?.isDetached ?? false)

watch(isDetached, (isNowDetached) => {
  if (!isNowDetached) uiStore.toggleFocusDock(true)
})
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <section
      v-if="uiStore.isFocusDockOpen && !isDetached"
      :data-focus-drop-zone="isCollecting || undefined"
      class="dock-surface absolute right-4 bottom-4 z-20 flex max-h-[calc(100%-4.5rem)] w-90 flex-col overflow-hidden rounded-2xl shadow-lg"
    >
      <header class="border-base-300 flex h-9 shrink-0 items-center justify-between border-b pr-2 pl-3.5 text-sm font-semibold">
        <span>Focus session</span>
        <BaseButton
          variant="ghost-muted"
          size="sm"
          icon="external-link"
          tooltip="Detach into its own window"
          @click="focusStore.dispatch({type: 'detach'})"
        />
      </header>

      <FocusPanel v-if="session" :session="session" should-accept-cards />
    </section>
  </BaseAnimation>
</template>
