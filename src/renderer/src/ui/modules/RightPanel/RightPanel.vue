<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from "vue"

import {useUIStore} from "@/stores/ui"
import {useAnimation} from "@/composables/useAnimation"
import {useFocusTrap} from "@/composables/useFocusTrap"
import {useShortcutsScope} from "@/composables/useShortcutsScope"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"

import Editor from "./{fragments}/Editor/Editor.vue"
import Footer from "./{fragments}/Footer/Footer.vue"
import Parameters from "./{fragments}/Parameters/Parameters.vue"
import Toolbar from "./{fragments}/Toolbar.vue"

const props = defineProps<{width: number}>()

const uiStore = useUIStore()

const panelRef = useTemplateRef<HTMLElement>("panelRef")
const panelStyle = computed(() => (uiStore.isCompact ? {} : {width: `${props.width}px`}))

const {isOpen, activeTask, isNew, canSave, close, commitDraft, commitDraftAndClose} = useTaskEditor()

const panel = useAnimation("slide")
const drawer = useAnimation("slide-x")
useFocusTrap(panelRef, isOpen)

function onEnter(el: Element, done: () => void) {
  ;(uiStore.isCompact ? drawer : panel).onEnter(el, done)
}

function onLeave(el: Element, done: () => void) {
  ;(uiStore.isCompact ? drawer : panel).onLeave(el, done)
}

useShortcutsScope({
  "editor:close": () => {
    if (!isOpen.value) return false
    close()
  },
  "editor:save": () => {
    if (!isOpen.value) return false
    if (canSave.value) commitDraft()
  },
  "editor:save-close": () => {
    if (!isOpen.value) return false
    if (canSave.value) commitDraftAndClose()
  },
})

watch(isOpen, async (open) => {
  if (!open || isNew.value) return
  await nextTick()
  panelRef.value?.focus()
})
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <aside v-if="isOpen" class="compact:fixed compact:inset-0 compact:z-40 bg-base-100 relative h-full shrink-0" :style="panelStyle">
      <div class="h-full w-full overflow-hidden">
        <div ref="panelRef" tabindex="-1" class="flex h-full w-full flex-col overflow-hidden outline-none" :style="panelStyle">
          <Toolbar />

          <div v-if="activeTask" class="flex min-h-0 flex-1 flex-col">
            <Parameters />
            <Editor />
            <Footer />
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>
