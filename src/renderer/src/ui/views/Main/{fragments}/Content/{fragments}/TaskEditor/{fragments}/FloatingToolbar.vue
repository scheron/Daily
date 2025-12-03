<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton.vue"

import {EditorView} from "@codemirror/view"
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import {markdownCommands} from "../commands/markdownCommands"

interface Props {
  editorView: EditorView | null
}

const props = defineProps<Props>()

let cleanupInterval: number | null = null

const toolbarRef = ref<HTMLElement | null>(null)
const selectionBounds = ref<DOMRect | null>(null)
const hasSelection = ref(false)

// Check if toolbar should be visible
const isVisible = computed(() => {
  return hasSelection.value && selectionBounds.value !== null
})

// Create virtual reference element from selection bounds
const virtualReference = computed(() => ({
  getBoundingClientRect: () => selectionBounds.value || new DOMRect(),
}))

// Setup floating positioning
const {floatingStyles} = useFloating(virtualReference, toolbarRef, {
  placement: "top",
  middleware: [offset(10), flip(), shift({padding: 12})],
  whileElementsMounted: autoUpdate,
})

// Function to update selection bounds
function updateSelectionBounds() {
  if (!props.editorView) {
    selectionBounds.value = null
    hasSelection.value = false
    return
  }

  const selection = props.editorView.state.selection.main

  if (selection.empty) {
    selectionBounds.value = null
    hasSelection.value = false
    return
  }

  // Update hasSelection immediately
  hasSelection.value = true

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
  } catch {
    // Selection out of bounds
    selectionBounds.value = null
    hasSelection.value = false
  }
}

// Watch for editor view changes and set up selection listener
watch(
  () => props.editorView,
  (view) => {
    // Clean up previous interval
    if (cleanupInterval !== null) {
      clearInterval(cleanupInterval)
      cleanupInterval = null
    }

    if (view) {
      // Initial update
      updateSelectionBounds()

      // Poll for selection changes more frequently
      cleanupInterval = setInterval(() => {
        updateSelectionBounds()
      }, 50) as unknown as number // Check twice as often
    } else {
      selectionBounds.value = null
      hasSelection.value = false
    }
  },
  {immediate: true},
)

// Cleanup on unmount
onBeforeUnmount(() => {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval)
  }
})

// Command handlers
function handleCommand(command: (view: EditorView) => boolean) {
  if (props.editorView) {
    command(props.editorView)
    // Keep focus on editor after command
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
        tooltip-position="bottom"
        @click="handleCommand(markdownCommands.toggleBold)"
      />
      <BaseButton
        icon="italic"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Italic (Cmd+I)"
        tooltip-position="bottom"
        @click="handleCommand(markdownCommands.toggleItalic)"
      />
      <BaseButton
        icon="code"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Inline Code (Cmd+`)"
        tooltip-position="bottom"
        @click="handleCommand(markdownCommands.toggleCode)"
      />

      <div class="bg-base-content/20 mx-2 h-8 w-px" />

      <BaseButton
        icon="heading"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Heading"
        tooltip-position="bottom"
        @click="handleCommand(markdownCommands.insertHeading2)"
      />
      <BaseButton
        icon="checkbox"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Checkbox"
        tooltip-position="bottom"
        @click="handleCommand(markdownCommands.insertCheckbox)"
      />
      <BaseButton
        icon="quote"
        variant="secondary"
        icon-class="size-4"
        size="sm"
        tooltip="Quote"
        tooltip-position="bottom"
        @click="handleCommand(markdownCommands.insertBlockquote)"
      />
    </div>
  </Teleport>
</template>
