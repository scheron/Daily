<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from "vue"

import {useFocusTrap} from "@/composables/useFocusTrap"
import {useUIStore} from "@/stores/ui"
import {useEditorShortcuts} from "./composables/useEditorShortcuts"
import {useTaskEditor} from "./composables/useTaskEditor"
import {animatePanel} from "./utils/animatePanel"
import Editor from "./{fragments}/Editor.vue"
import Footer from "./{fragments}/Footer"
import Parameters from "./{fragments}/Parameters"
import Toolbar from "./{fragments}/Toolbar.vue"

const props = defineProps<{width: number}>()

const uiStore = useUIStore()

const panelRef = useTemplateRef<HTMLElement>("panel")
const panelStyle = computed(() => (uiStore.isCompact ? {} : {width: `${props.width}px`}))

const {isOpen, activeTask, isNew} = useTaskEditor()

useFocusTrap(panelRef, isOpen)
useEditorShortcuts()

function onEnter(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, uiStore.isCompact ? "slide-x" : "slide", true).then(done, done)
}

function onLeave(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, uiStore.isCompact ? "slide-x" : "slide", false).then(done, done)
}

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
        <div ref="panel" tabindex="-1" class="flex h-full w-full flex-col overflow-hidden outline-none" :style="panelStyle">
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
