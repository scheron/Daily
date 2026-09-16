<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from "vue"

import {useFocusTrap} from "@/composables/useFocusTrap"
import {useEditorShortcuts} from "./composables/useEditorShortcuts"
import {useTaskEditor} from "./composables/useTaskEditor"
import {animatePanel} from "./utils/animatePanel"
import Details from "./{fragments}/Details"
import Editor from "./{fragments}/Editor.vue"
import Footer from "./{fragments}/Footer"
import Toolbar from "./{fragments}/Toolbar.vue"

const props = defineProps<{width: number}>()

const panelRef = useTemplateRef<HTMLElement>("panel")
const panelStyle = computed(() => ({width: `${props.width}px`}))
const surfaceStyle = computed(() => ({width: `${props.width - 8}px`}))

const {isOpen, activeTask, isNew} = useTaskEditor()

useFocusTrap(panelRef, isOpen)
useEditorShortcuts()

function onEnter(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, true).then(done, done)
}

function onLeave(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, false).then(done, done)
}

watch(isOpen, async (open) => {
  if (!open || isNew.value) return
  await nextTick()
  panelRef.value?.focus()
})
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <aside v-if="isOpen" class="relative h-full shrink-0 py-2 pr-2" :style="panelStyle">
      <div class="dock-surface h-full overflow-hidden rounded-2xl" :style="surfaceStyle">
        <div ref="panel" tabindex="-1" class="flex h-full w-full flex-col overflow-hidden outline-none" :style="surfaceStyle">
          <Toolbar />

          <template v-if="activeTask">
            <Details :task="activeTask" />
            <Editor />
            <Footer />
          </template>
        </div>
      </div>
    </aside>
  </Transition>
</template>
