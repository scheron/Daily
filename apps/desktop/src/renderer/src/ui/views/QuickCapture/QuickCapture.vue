<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, useTemplateRef} from "vue"
import {useEventListener} from "@vueuse/core"

import {useSettingsStore} from "@/stores/settings.store"
import {useThemeStore} from "@/stores/theme"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {useQuickCaptureDraft} from "./composables/useQuickCaptureDraft"
import {useReportPanelHeight} from "./composables/useReportPanelHeight"
import QuickCaptureChips from "./{fragments}/QuickCaptureChips.vue"

import type {QuickCaptureMenu} from "@shared/types/quickCapture"

const EDITOR_MIN_LINES = 5

const settingsStore = useSettingsStore()

useThemeStore()

const panelRef = useTemplateRef<HTMLElement>("panel")
const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")

const {draft, task, patch, refresh, save} = useQuickCaptureDraft()

useReportPanelHeight(panelRef)

useEventListener(
  window,
  "keydown",
  (event) => {
    if (event.key !== "Enter" || !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    onSave()
  },
  {capture: true},
)

useEventListener(window, "keydown", (event) => {
  if (event.key === "Escape" && !event.defaultPrevented) window.BridgeIPC["quick-capture:hide"]()
})

const stopListeningShown = window.BridgeIPC["quick-capture:on-shown"](onShown)
const stopListeningMenuPick = window.BridgeIPC["quick-capture:on-menu-pick"]((index) => editorRef.value?.pickCompletion(index))

async function onSave() {
  if (!(await save())) return

  window.BridgeIPC["quick-capture:hide"]()
  await nextTick()
  editorRef.value?.resetHistory()
}

function onMenu(menu: QuickCaptureMenu | null) {
  window.BridgeIPC["quick-capture:set-menu"](menu)
}

async function onShown() {
  await settingsStore.revalidate()
  refresh()
  editorRef.value?.focus()
}

onMounted(() => {
  window.BridgeIPC.send("window:ready")
  editorRef.value?.focus()
})

onBeforeUnmount(() => {
  stopListeningShown()
  stopListeningMenuPick()
})
</script>

<template>
  <div ref="panel" class="bg-base-100 border-base-300 text-base-content flex w-full flex-col gap-5 rounded-2xl border p-3">
    <MarkdownEditor
      ref="editor"
      :content="draft.content"
      :task="task"
      external-menu
      :min-lines="EDITOR_MIN_LINES"
      no-attachments
      class="[--editor-line-height:20px] [&_.cm-content]:!text-[14px] [&_.cm-content]:!leading-[20px] [&_.cm-editor]:max-h-60 [&_.cm-line]:!leading-[20px]"
      @update:content="patch({content: $event})"
      @patch="patch"
      @menu="onMenu"
    />
    <div data-testid="quick-capture-footer" class="flex items-end justify-between gap-3">
      <QuickCaptureChips :task="task" class="min-w-0" @patch="patch" />
      <span data-testid="quick-capture-hint" class="text-base-content/50 shrink-0 whitespace-nowrap text-[11px] leading-6">
        ⌘Enter send · Esc close
      </span>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  background: transparent;
}
</style>
