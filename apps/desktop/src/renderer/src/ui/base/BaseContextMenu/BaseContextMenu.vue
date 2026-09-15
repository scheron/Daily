<script setup lang="ts">
import {nextTick, ref, useSlots, useTemplateRef} from "vue"
import {useEventListener} from "@vueuse/core"

import {cn} from "@/utils/ui/tailwindcss"
import {useContextMenuProvider} from "./composables/useContextMenuProvider"
import {useMenuPosition} from "./composables/useMenuPosition"
import MenuPanel from "./{fragments}/MenuPanel"

import type {BaseContextMenuItem, BaseContextMenuSelectEvent} from "./types"

defineProps<{items: BaseContextMenuItem[]}>()

const emit = defineEmits<{select: [path: BaseContextMenuSelectEvent]}>()

const isOpen = ref(false)
const isVisible = ref(false)

const triggerRef = useTemplateRef("trigger")
const menuRef = useTemplateRef("menu")

const slots = useSlots()
const {submenuElements} = useContextMenuProvider(slots)
const {floatingStyles, setPosition} = useMenuPosition(menuRef)

useEventListener(triggerRef, "contextmenu", (event: MouseEvent) => {
  event.preventDefault()
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

function openAt(event: MouseEvent) {
  setPosition(event)

  isOpen.value = true
  isVisible.value = false

  nextTick(() => requestAnimationFrame(() => (isVisible.value = true)))
}

function close() {
  if (!isOpen.value) return
  isOpen.value = false
  isVisible.value = false
}

function onSelect(path: BaseContextMenuSelectEvent) {
  emit("select", path)
  close()
}

function getPanelClasses(isVisible: boolean) {
  return cn(
    "bg-base-100 border-base-300 min-w-44 rounded-lg border shadow-lg transition-opacity duration-100 ease-out",
    isVisible ? "opacity-100" : "opacity-0",
  )
}

defineExpose({
  close,
})
</script>

<template>
  <div ref="trigger">
    <slot />
  </div>

  <Teleport to="body">
    <div v-if="isOpen" ref="menu" :style="floatingStyles" class="z-50">
      <div :class="getPanelClasses(isVisible)">
        <MenuPanel :items="items" @select="onSelect" />
      </div>
    </div>
  </Teleport>
</template>
