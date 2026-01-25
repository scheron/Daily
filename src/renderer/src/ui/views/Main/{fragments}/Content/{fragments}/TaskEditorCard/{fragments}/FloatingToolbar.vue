<script setup lang="ts">
import {computed, ref} from "vue"

import {blockCommands} from "@/utils/codemirror/commands/blockCommands"
import {inlineCommands} from "@/utils/codemirror/commands/inlineCommands"
import BaseButton from "@/ui/base/BaseButton.vue"

import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import {useEditorSelection} from "../composables/useEditorSelection"

import type {EditorView} from "@codemirror/view"

const props = defineProps<{editorView: EditorView | null}>()

const toolbarRef = ref<HTMLElement | null>(null)

const {selectionBounds, hasSelection} = useEditorSelection(computed(() => props.editorView))
const isVisible = computed(() => hasSelection.value && selectionBounds.value !== null)

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
      class="bg-base-200 border-base-content/20 z-60 flex items-center gap-1 rounded-lg border p-1 shadow-lg"
    >
      <BaseButton
        icon="bold"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Bold (Cmd+B)"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleBold)"
      />
      <BaseButton
        icon="italic"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Italic (Cmd+I)"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleItalic)"
      />
      <BaseButton
        icon="code"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Inline Code (Cmd+`)"
        tooltip-position="top"
        @click="onCommand(inlineCommands.toggleCode)"
      />

      <div class="bg-base-content/20 mx-2 h-8 w-px" />

      <BaseButton
        icon="heading"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Heading"
        tooltip-position="top"
        @click="onCommand(blockCommands.insertHeading2)"
      />
      <BaseButton
        icon="checkbox"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Checkbox"
        tooltip-position="top"
        @click="onCommand(blockCommands.insertCheckbox)"
      />
      <BaseButton
        icon="quote"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Quote"
        tooltip-position="top"
        @click="onCommand(blockCommands.insertBlockquote)"
      />
    </div>
  </Teleport>
</template>
