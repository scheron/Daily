<script setup lang="ts">
import {computed} from "vue"

import {useFocusStore} from "@/stores/focus.store"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import FocusBreak from "./{fragments}/FocusBreak.vue"
import FocusCollect from "./{fragments}/FocusCollect"
import FocusCurrent from "./{fragments}/FocusCurrent.vue"
import FocusSummary from "./{fragments}/FocusSummary.vue"

const uiStore = useUIStore()
const focusStore = useFocusStore()

const session = computed(() => focusStore.session)
const isCollecting = computed(() => session.value?.phase === "collect")
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <section
      v-if="uiStore.isFocusDockOpen"
      :data-focus-drop-zone="isCollecting || undefined"
      class="dock-surface absolute right-4 bottom-4 z-20 flex max-h-[calc(100%-4.5rem)] w-90 flex-col overflow-hidden rounded-2xl shadow-lg"
    >
      <header class="border-base-300 flex h-9 shrink-0 items-center border-b px-3.5 text-sm font-semibold">Focus session</header>

      <div class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
        <FocusCollect v-if="isCollecting" />
        <FocusCurrent v-else-if="session?.phase === 'focus' || session?.phase === 'pause'" :session="session" />
        <FocusBreak v-else-if="session?.phase === 'break'" :session="session" />
        <FocusSummary v-else-if="session?.phase === 'summary'" :session="session" />
      </div>
    </section>
  </BaseAnimation>
</template>
