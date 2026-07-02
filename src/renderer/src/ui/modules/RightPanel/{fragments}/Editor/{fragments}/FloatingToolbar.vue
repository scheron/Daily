<script setup lang="ts">
import {computed, ref} from "vue"

import {notNull} from "@shared/utils/common/validators"
import {inlineCommands, linkCommands} from "@/utils/codemirror/commands"
import BaseButton from "@/ui/base/BaseButton"

import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import {useEditorSelection} from "../composables/useEditorSelection"

import type {EditorView} from "@codemirror/view"

const props = defineProps<{editorView: EditorView | null}>()

const toolbarRef = ref<HTMLElement | null>(null)

const {selectionBounds, hasSelection} = useEditorSelection(computed(() => props.editorView))
const isVisible = computed(() => hasSelection.value && notNull(selectionBounds.value))

const virtualReference = computed(() => ({
  getBoundingClientRect: () => selectionBounds.value || new DOMRect(),
}))

const {floatingStyles} = useFloating(virtualReference, toolbarRef, {
  placement: "top",
  middleware: [offset(10), flip(), shift({padding: 12})],
  whileElementsMounted: autoUpdate,
})

function onCommand(command: (view: EditorView) => boolean) {
  if (props.editorView) {
    command(props.editorView)
    props.editorView.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      ref="toolbarRef"
      :style="floatingStyles"
      class="bg-base-100 border-base-300 z-60 flex items-center gap-1 rounded-lg border px-2 py-1 shadow-lg"
    >
      <BaseButton
        icon="bold"
        variant="ghost"
        icon-class="size-4"
        size="sm"
        tooltip="Bold (Cmd+B)"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleBold)"
      />
      <BaseButton
        icon="italic"
        variant="ghost"
        icon-class="size-4"
        size="sm"
        tooltip="Italic (Cmd+I)"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleItalic)"
      />
      <BaseButton
        icon="code"
        variant="ghost"
        icon-class="size-4"
        size="sm"
        tooltip="Inline Code (Cmd+`)"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleCode)"
      />
      <BaseButton
        icon="strikethrough"
        variant="ghost"
        icon-class="size-4"
        size="sm"
        tooltip="Strikethrough"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleStrikethrough)"
      />
      <BaseButton
        icon="link"
        variant="ghost"
        icon-class="size-4"
        size="sm"
        tooltip="Link"
        tooltip-position="top"
        @click="onCommand(linkCommands.insertLink)"
      />

      <div class="bg-base-content/20 mx-2 h-8 w-px" />

      <BaseButton
        icon="remove-formatting"
        variant="ghost"
        icon-class="size-4"
        size="sm"
        tooltip="Clear Formatting"
        tooltip-position="top"
        @click="onCommand(inlineCommands.clearFormatting)"
      />
    </div>
  </Teleport>
</template>
