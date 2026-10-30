<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef, watch} from "vue"
import {useEventListener} from "@vueuse/core"

import {useFocusTrap} from "@/composables/useFocusTrap"
import {useEditorShortcuts} from "./composables/useEditorShortcuts"
import {openedSubtaskId} from "./composables/useSubtaskEditorOpen"
import {useTaskEditor} from "./composables/useTaskEditor"
import {animatePanel} from "./utils/animatePanel"
import {getTaskTitle} from "./utils/getTaskTitle"
import Comments from "./{fragments}/Comments"
import Details from "./{fragments}/Details"
import Editor from "./{fragments}/Editor.vue"
import Footer from "./{fragments}/Footer.vue"
import Subtasks from "./{fragments}/Subtasks"
import SubtaskView from "./{fragments}/SubtaskView"
import Toolbar from "./{fragments}/Toolbar.vue"

const props = defineProps<{width: number}>()

const panelRef = useTemplateRef<HTMLElement>("panel")
const scrollerRef = useTemplateRef<HTMLElement>("scroller")
const isFirstLineOut = ref(false)
let savedScrollTop = 0

const panelStyle = computed(() => ({width: `${props.width}px`}))
const surfaceStyle = computed(() => ({width: `${props.width - 8}px`}))

const {isOpen, activeTask, isNew, editingTaskId, localContent} = useTaskEditor()

const toolbarTitle = computed(() => (isFirstLineOut.value ? getTaskTitle(localContent.value) : ""))

useFocusTrap(panelRef, isOpen)
useEditorShortcuts()

useEventListener(scrollerRef, "scroll", updateFirstLineOut, {passive: true})

function updateFirstLineOut() {
  if (openedSubtaskId.value) return
  const scroller = scrollerRef.value
  const line = scroller?.querySelector(".cm-line")
  isFirstLineOut.value = !!scroller && !!line && line.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top
}

function onEnter(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, true).then(done, done)
}

function onLeave(el: Element, done: () => void) {
  animatePanel(el as HTMLElement, false).then(done, done)
}

watch([editingTaskId, isNew], () => {
  openedSubtaskId.value = null
  savedScrollTop = 0
  isFirstLineOut.value = false
  scrollerRef.value?.scrollTo({top: 0})
})

watch(openedSubtaskId, async (id, previous) => {
  if (id && !previous) savedScrollTop = scrollerRef.value?.scrollTop ?? 0
  if (id || !previous) return
  await nextTick()
  scrollerRef.value?.scrollTo({top: savedScrollTop})
})

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
          <Toolbar v-show="!openedSubtaskId" :title="toolbarTitle" />

          <template v-if="activeTask">
            <SubtaskView v-if="openedSubtaskId" :key="editingTaskId ?? 'new'" :subtask-id="openedSubtaskId" />

            <div v-show="!openedSubtaskId" ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
              <div class="flex min-h-full flex-col">
                <Details :task="activeTask" />
                <Editor />
                <Subtasks />
                <Comments />
              </div>
            </div>

            <Footer v-show="!openedSubtaskId" />
          </template>
        </div>
      </div>
    </aside>
  </Transition>
</template>
