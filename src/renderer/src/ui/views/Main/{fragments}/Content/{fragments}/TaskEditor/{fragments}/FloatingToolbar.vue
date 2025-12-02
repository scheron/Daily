<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {EditorView} from "@codemirror/view"
// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"

import BaseButton from "@/ui/base/BaseButton.vue"
import {markdownCommands} from "../commands/markdownCommands"

interface Props {
  editorView: EditorView | null
}

const props = defineProps<Props>()

const toolbarRef = ref<HTMLElement | null>(null)
const selectionBounds = ref<DOMRect | null>(null)

// Check if toolbar should be visible
const isVisible = computed(() => {
  if (!props.editorView) return false

  const selection = props.editorView.state.selection.main
  return !selection.empty && props.editorView.hasFocus && selectionBounds.value !== null
})

// Create virtual reference element from selection bounds
const virtualReference = computed(() => ({
  getBoundingClientRect: () => selectionBounds.value || new DOMRect(),
}))

// Setup floating positioning
const {floatingStyles} = useFloating(virtualReference, toolbarRef, {
  placement: "top",
  middleware: [
    offset(8),
    flip(), // Flip to bottom if no space above
    shift({padding: 8}), // Stay within viewport
  ],
  whileElementsMounted: autoUpdate,
})

// Watch editor selection and update bounds
watch(
  () => props.editorView?.state.selection,
  () => {
    if (!props.editorView) {
      selectionBounds.value = null
      return
    }

    const selection = props.editorView.state.selection.main

    if (selection.empty) {
      selectionBounds.value = null
      return
    }

    try {
      const fromCoords = props.editorView.coordsAtPos(selection.from)
      const toCoords = props.editorView.coordsAtPos(selection.to)

      if (fromCoords && toCoords) {
        selectionBounds.value = DOMRect.fromRect({
          x: Math.min(fromCoords.left, toCoords.left),
          y: Math.min(fromCoords.top, toCoords.top),
          width: Math.abs(toCoords.right - fromCoords.left),
          height: Math.abs(toCoords.bottom - fromCoords.top),
        })
      }
    } catch (err) {
      // Selection out of bounds
      selectionBounds.value = null
    }
  },
  {immediate: true, deep: true},
)

// Command handlers
function handleCommand(command: (view: EditorView) => boolean) {
  if (props.editorView) {
    command(props.editorView)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      ref="toolbarRef"
      :style="floatingStyles"
      class="bg-base-100 border-base-300 z-[60] flex gap-1 rounded-lg border p-1 shadow-lg"
    >
      <!-- Group 1: Text Formatting -->
      <div class="border-base-300 flex gap-0.5 border-r pr-1">
        <BaseButton
          icon="bold"
          variant="ghost"
          size="sm"
          tooltip="Bold (Cmd+B)"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.toggleBold)"
        />
        <BaseButton
          icon="italic"
          variant="ghost"
          size="sm"
          tooltip="Italic (Cmd+I)"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.toggleItalic)"
        />
        <BaseButton
          icon="code"
          variant="ghost"
          size="sm"
          tooltip="Inline Code (Cmd+`)"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.toggleCode)"
        />
        <BaseButton
          icon="strikethrough"
          variant="ghost"
          size="sm"
          tooltip="Strikethrough"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.toggleStrikethrough)"
        />
      </div>

      <!-- Group 2: Block Elements -->
      <div class="border-base-300 flex gap-0.5 border-r pr-1">
        <BaseButton
          icon="heading"
          variant="ghost"
          size="sm"
          tooltip="Heading"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertHeading2)"
        />
        <BaseButton
          icon="list-bullet"
          variant="ghost"
          size="sm"
          tooltip="Bullet List"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertBulletList)"
        />
        <BaseButton
          icon="list-numbered"
          variant="ghost"
          size="sm"
          tooltip="Numbered List"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertNumberedList)"
        />
        <BaseButton
          icon="checkbox"
          variant="ghost"
          size="sm"
          tooltip="Checkbox"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertCheckbox)"
        />
        <BaseButton
          icon="quote"
          variant="ghost"
          size="sm"
          tooltip="Quote"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertBlockquote)"
        />
      </div>

      <!-- Group 3: Rich Content -->
      <div class="border-base-300 flex gap-0.5 border-r pr-1">
        <BaseButton
          icon="link"
          variant="ghost"
          size="sm"
          tooltip="Link (Cmd+K)"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertLink)"
        />
        <BaseButton
          icon="image"
          variant="ghost"
          size="sm"
          tooltip="Image"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertImage())"
        />
        <BaseButton
          icon="code-block"
          variant="ghost"
          size="sm"
          tooltip="Code Block"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertCodeBlock)"
        />
        <BaseButton
          icon="table"
          variant="ghost"
          size="sm"
          tooltip="Table"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.insertTable)"
        />
      </div>

      <!-- Group 4: Advanced -->
      <div class="flex gap-0.5">
        <BaseButton
          icon="x-mark"
          variant="ghost"
          size="sm"
          tooltip="Clear Formatting"
          tooltip-position="bottom"
          @click="handleCommand(markdownCommands.clearFormatting)"
        />
      </div>
    </div>
  </Teleport>
</template>
