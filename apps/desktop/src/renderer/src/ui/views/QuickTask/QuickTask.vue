<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, useTemplateRef} from "vue"
import {useEventListener} from "@vueuse/core"

import {useSettingsStore} from "@/stores/settings.store"
import {useThemeStore} from "@/stores/theme"
import BaseKeyCaps from "@/ui/base/BaseKeyCaps.vue"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {toAcceleratorKeyCaps} from "@/utils/shortcuts/toAcceleratorKeyCaps"
import {useQuickTaskDraft} from "./composables/useQuickTaskDraft"
import {useReportPanelHeight} from "./composables/useReportPanelHeight"
import QuickTaskChips from "./{fragments}/QuickTaskChips.vue"

import type {QuickTaskMenu} from "@shared/types/quickTask"

const EDITOR_MIN_LINES = 5
const SEND_KEYS = toAcceleratorKeyCaps("CmdOrCtrl+Enter")
const CLOSE_KEYS = toAcceleratorKeyCaps("Escape")

const settingsStore = useSettingsStore()

useThemeStore()

const panelRef = useTemplateRef<HTMLElement>("panel")
const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")

const {draft, task, patch, refresh, save} = useQuickTaskDraft()

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
  if (event.key === "Escape" && !event.defaultPrevented) window.BridgeIPC["quick-task:hide"]()
})

const stopListeningShown = window.BridgeIPC["quick-task:on-shown"](onShown)
const stopListeningMenuPick = window.BridgeIPC["quick-task:on-menu-pick"]((index) => editorRef.value?.pickCompletion(index))

async function onSave() {
  if (!(await save())) return

  window.BridgeIPC["quick-task:hide"]()
  await nextTick()
  editorRef.value?.resetHistory()
}

function onMenu(menu: QuickTaskMenu | null) {
  window.BridgeIPC["quick-task:set-menu"](menu)
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
    <div data-testid="quick-task-footer" class="flex items-end justify-between gap-3">
      <QuickTaskChips :task="task" class="min-w-0" @patch="patch" />
      <span data-testid="quick-task-hint" class="text-base-content/50 flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] leading-6">
        <BaseKeyCaps :keys="SEND_KEYS" />
        <span class="mr-1.5">send</span>
        <BaseKeyCaps :keys="CLOSE_KEYS" />
        <span>close</span>
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
