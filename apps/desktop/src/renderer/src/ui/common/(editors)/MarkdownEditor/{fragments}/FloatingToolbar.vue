<script setup lang="ts">
import {useTemplateRef, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {BubbleMenuPlugin} from "@tiptap/extension-bubble-menu"
import {PluginKey} from "@tiptap/pm/state"

import type {Editor} from "@tiptap/vue-3"

const buttons = [
  {icon: "bold", label: "Bold", tooltip: "Bold (Cmd+B)", command: "toggleBold"},
  {icon: "italic", label: "Italic", tooltip: "Italic (Cmd+I)", command: "toggleItalic"},
  {icon: "code", label: "Inline code", tooltip: "Inline Code (Cmd+`)", command: "toggleCode"},
  {icon: "strikethrough", label: "Strikethrough", tooltip: "Strikethrough", command: "toggleStrike"},
] as const

const props = defineProps<{editor: Editor}>()
const emit = defineEmits<{"edit-link": []}>()

const toolbarRef = useTemplateRef<HTMLDivElement>("toolbar")

function format(command: (typeof buttons)[number]["command"]) {
  props.editor.chain().focus()[command]().run()
}

function clearFormatting() {
  props.editor.chain().focus().unsetAllMarks().run()
}

watch(
  [() => props.editor, toolbarRef],
  ([editor, element], _, onCleanup) => {
    if (!element || editor.isDestroyed) return

    const toolbarKey = new PluginKey("dailyFormattingToolbar")
    element.style.position = "absolute"
    element.style.visibility = "hidden"
    element.remove()
    editor.registerPlugin(
      BubbleMenuPlugin({
        pluginKey: toolbarKey,
        editor,
        element,
        appendTo: () => element.ownerDocument.body,
        options: {strategy: "fixed", placement: "top", offset: 10, flip: true, shift: true},
      }),
    )
    onCleanup(() => {
      if (!editor.isDestroyed) editor.unregisterPlugin(toolbarKey)
    })
  },
  {flush: "post"},
)
</script>

<template>
  <div ref="toolbar" class="bg-base-100 border-base-300 z-60 flex items-center gap-1 rounded-lg border px-2 py-1 shadow-lg" @mousedown.prevent>
    <BaseButton
      v-for="button in buttons"
      :key="button.icon"
      :icon="button.icon"
      variant="ghost"
      size="sm"
      :tooltip="button.tooltip"
      :aria-label="button.label"
      tooltip-position="top"
      @click="format(button.command)"
    />
    <BaseButton icon="link" variant="ghost" size="sm" tooltip="Link" aria-label="Edit link" tooltip-position="top" @click="emit('edit-link')" />
    <div class="bg-base-content/20 mx-2 h-8 w-px" />
    <BaseButton
      icon="remove-formatting"
      variant="ghost"
      size="sm"
      tooltip="Clear Formatting"
      aria-label="Clear formatting"
      tooltip-position="top"
      @click="clearFormatting"
    />
  </div>
</template>
