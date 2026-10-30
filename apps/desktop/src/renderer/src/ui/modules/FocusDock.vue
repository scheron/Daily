<script setup lang="ts">
import {computed, useTemplateRef, watch} from "vue"
import {storeToRefs} from "pinia"

import {useFocusStore} from "@/stores/focus.store"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import FocusPanel from "@/ui/common/focus/FocusPanel"

const uiStore = useUIStore()
const focusStore = useFocusStore()

const {session} = storeToRefs(focusStore)

const dockRef = useTemplateRef<HTMLElement>("dock")

const isCollecting = computed(() => session.value?.phase === "collect")
const isDetached = computed(() => session.value?.isDetached ?? false)

watch(isDetached, (isNowDetached) => {
  if (!isNowDetached) uiStore.toggleFocusDock(true)
})

defineExpose({element: dockRef})
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <section
      v-if="uiStore.isFocusDockOpen && !isDetached"
      ref="dock"
      :data-focus-drop-zone="isCollecting || undefined"
      class="dock-surface w-90 absolute bottom-4 right-4 z-20 flex max-h-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-2xl shadow-lg"
    >
      <header class="border-base-300 flex h-9 shrink-0 items-center justify-between border-b pl-3.5 pr-2 text-sm font-semibold">
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
