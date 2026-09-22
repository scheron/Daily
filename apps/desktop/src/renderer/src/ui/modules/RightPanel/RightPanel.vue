<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef, watch} from "vue"

import {useFocusTrap} from "@/composables/useFocusTrap"
import {useEditorShortcuts} from "./composables/useEditorShortcuts"
import {useTaskEditor} from "./composables/useTaskEditor"
import {animatePanel} from "./utils/animatePanel"
import Details from "./{fragments}/Details"
import Editor from "./{fragments}/Editor.vue"
import Footer from "./{fragments}/Footer"
import History from "./{fragments}/History"
import PanelTabs from "./{fragments}/PanelTabs.vue"
import Toolbar from "./{fragments}/Toolbar.vue"

import type {PanelTab} from "./types"

const props = defineProps<{width: number}>()

const panelRef = useTemplateRef<HTMLElement>("panel")
const activeTab = ref<PanelTab>("editor")

const panelStyle = computed(() => ({width: `${props.width}px`}))
const surfaceStyle = computed(() => ({width: `${props.width - 8}px`}))
const isCompact = computed(() => props.width <= 380)

const {isOpen, activeTask, isNew, editingTaskId} = useTaskEditor()

useFocusTrap(panelRef, isOpen)
useEditorShortcuts()

function onEnter(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, true).then(done, done)
}

function onLeave(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, false).then(done, done)
}

watch([editingTaskId, isNew], () => (activeTab.value = "editor"))

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

            <PanelTabs v-if="!isNew" :active="activeTab" :compact="isCompact" @select="activeTab = $event" />

            <Editor v-if="isNew || activeTab === 'editor'" />
            <History v-else-if="activeTab === 'history'" />

            <Footer />
          </template>
        </div>
      </div>
    </aside>
  </Transition>
</template>
