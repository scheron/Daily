<script setup lang="ts">
import {nextTick, ref, toRef, useSlots} from "vue"
import {useEventListener} from "@vueuse/core"

import MenuPanel from "./{fragments}/MenuPanel.vue"
import {useContextMenuProvider} from "./model/useContextMenuProvider"
import {useMenuPosition} from "./model/useMenuPosition"

import type {ContextMenuItem} from "./types"

const props = withDefaults(
  defineProps<{
    items: ContextMenuItem[]
    submenuPrefersLeft?: boolean
    preventAutoOpen?: boolean
    preventAutoClose?: boolean
    disabled?: boolean
  }>(),
  {
    submenuPrefersLeft: false,
    preventAutoOpen: false,
    preventAutoClose: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  select: [path: ContextMenuItem[]]
  open: []
  close: []
}>()

const slots = useSlots()

const isOpen = ref(false)
const isVisible = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

// --- Composables ---
const {submenuElements} = useContextMenuProvider(slots, toRef(props, "submenuPrefersLeft"))
const {floatingStyles, setPosition} = useMenuPosition(menuRef)

// --- Open / Close ---
function openAt(positionOrEvent: {x: number; y: number} | MouseEvent) {
  if (props.disabled) return

  setPosition(positionOrEvent)

  isOpen.value = true
  isVisible.value = false
  emit("open")

  // Wait for floating-ui to compute position before showing
  nextTick(() => {
    requestAnimationFrame(() => {
      isVisible.value = true
    })
  })
}

function close() {
  if (!isOpen.value) return
  isOpen.value = false
  isVisible.value = false
  emit("close")
}

function onSelect(path: ContextMenuItem[]) {
  emit("select", path)
  if (!props.preventAutoClose) {
    close()
  }
}

// --- Auto-open on contextmenu ---
useEventListener(triggerRef, "contextmenu", (event: MouseEvent) => {
  event.preventDefault()
  if (props.disabled || props.preventAutoOpen) return
  openAt(event)
})

// --- Close on click outside ---
useEventListener(document, "pointerdown", (event: PointerEvent) => {
  if (!isOpen.value) return

  const target = event.target as Node

  // Check if click is inside menu
  if (menuRef.value?.contains(target)) return

  // Check if click is inside any submenu
  for (const el of submenuElements.value) {
    if (el.contains(target)) return
  }

  close()
})

// --- Close on Escape ---
useEventListener(document, "keydown", (event: KeyboardEvent) => {
  if (!isOpen.value) return
  if (event.key === "Escape") {
    event.stopPropagation()
    close()
  }
})

// --- Close on window blur ---
useEventListener(window, "blur", () => {
  if (isOpen.value) close()
})

// --- Expose ---
defineExpose({
  openAt,
  close,
  isOpen,
})
</script>

<template>
  <div ref="triggerRef">
    <slot name="trigger" :open="openAt" :close="close" :is-open="isOpen" />
  </div>

  <Teleport to="body">
    <div v-if="isOpen" ref="menuRef" :style="floatingStyles" class="z-50">
      <div
        class="bg-base-100 border-base-300 min-w-44 rounded-lg border shadow-lg transition-opacity duration-100 ease-out"
        :class="isVisible ? 'opacity-100' : 'opacity-0'"
      >
        <MenuPanel :items="items" :submenu-prefers-left="submenuPrefersLeft" @select="onSelect" />
      </div>
    </div>
  </Teleport>
</template>
