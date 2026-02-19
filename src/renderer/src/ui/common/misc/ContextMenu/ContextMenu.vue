<script setup lang="ts">
import {nextTick, ref, toRef, useSlots, useTemplateRef} from "vue"
import {useEventListener} from "@vueuse/core"

import {useContextMenuProvider} from "./composables/useContextMenuProvider"
import {useMenuPosition} from "./composables/useMenuPosition"
import MenuPanel from "./{fragments}/MenuPanel.vue"

import type {ContextMenuItem, ContextMenuSelectEvent} from "./types"

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
  select: [path: ContextMenuSelectEvent]
  open: []
  close: []
}>()

const slots = useSlots()

const isOpen = ref(false)
const isVisible = ref(false)
const triggerRef = useTemplateRef("trigger")
const menuRef = useTemplateRef("menu")

const {submenuElements} = useContextMenuProvider(slots, toRef(props, "submenuPrefersLeft"))
const {floatingStyles, setPosition} = useMenuPosition(menuRef)

function openAt(positionOrEvent: {x: number; y: number} | MouseEvent) {
  if (props.disabled) return

  setPosition(positionOrEvent)

  isOpen.value = true
  isVisible.value = false
  emit("open")

  nextTick(() => requestAnimationFrame(() => (isVisible.value = true)))
}

function close() {
  if (!isOpen.value) return
  isOpen.value = false
  isVisible.value = false
  emit("close")
}

function onSelect(path: ContextMenuSelectEvent) {
  emit("select", path)
  if (!props.preventAutoClose) close()
}

useEventListener(triggerRef, "contextmenu", (event: MouseEvent) => {
  event.preventDefault()
  if (props.disabled || props.preventAutoOpen) return
  openAt(event)
})

useEventListener(document, "pointerdown", (event: PointerEvent) => {
  if (!isOpen.value) return

  const target = event.target as Node

  if (menuRef.value?.contains(target)) return
  for (const el of submenuElements.value) if (el.contains(target)) return

  close()
})

useEventListener(document, "keydown", (event: KeyboardEvent) => {
  if (!isOpen.value) return
  if (event.key === "Escape") {
    event.stopPropagation()
    close()
  }
})

useEventListener(window, "blur", () => isOpen.value && close())

defineExpose({
  openAt,
  close,
  isOpen,
})
</script>

<template>
  <div ref="trigger">
    <slot :open="openAt" :close="close" :is-open="isOpen" />
  </div>

  <Teleport to="body">
    <div v-if="isOpen" ref="menu" :style="floatingStyles" class="z-50">
      <div
        class="bg-base-100 border-base-300 min-w-44 rounded-lg border shadow-lg transition-opacity duration-100 ease-out"
        :class="isVisible ? 'opacity-100' : 'opacity-0'"
      >
        <MenuPanel :items="items" :submenu-prefers-left="submenuPrefersLeft" @select="onSelect" />
      </div>
    </div>
  </Teleport>
</template>
