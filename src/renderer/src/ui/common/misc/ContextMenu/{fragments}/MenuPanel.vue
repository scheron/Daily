<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from "vue"

// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import {useContextMenuConsumer} from "../model/useContextMenuProvider"
import {useSubmenuNavigation} from "../model/useSubmenuNavigation"
import MenuList from "./MenuList.vue"

import type {ContextMenuItem} from "../types"

const props = defineProps<{
  items: ContextMenuItem[]
  submenuPrefersLeft?: boolean
}>()

const emit = defineEmits<{
  select: [path: ContextMenuItem[]]
}>()

const {contextMenuSlots, registerSubmenu, unregisterSubmenu} = useContextMenuConsumer()

const submenuPanelRef = ref<HTMLElement | null>(null)

function itemHasSubmenu(item: ContextMenuItem): boolean {
  if (item.separator) return false
  return !!item.children
}

const {activeSubmenuItem, activeSubmenuEl, ...navigation} = useSubmenuNavigation(submenuPanelRef, itemHasSubmenu)

const hasChildrenSubmenu = computed(() => {
  return !!(activeSubmenuItem.value && !activeSubmenuItem.value.separator && Array.isArray(activeSubmenuItem.value.children))
})
const hasSlotSubmenu = computed(() => {
  return !!(activeSubmenuItem.value && !activeSubmenuItem.value.separator && activeSubmenuItem.value.children === true)
})
const hasSubmenu = computed(() => hasChildrenSubmenu.value || hasSlotSubmenu.value)

const submenuSlotName = computed(() => {
  if (!hasSlotSubmenu.value || !activeSubmenuItem.value || activeSubmenuItem.value.separator) return null
  return `child-${activeSubmenuItem.value.value}`
})

const placement = computed(() => (props.submenuPrefersLeft ? "left-start" : "right-start"))

const {floatingStyles} = useFloating(activeSubmenuEl, submenuPanelRef, {
  placement,
  strategy: "fixed",
  middleware: [offset(4), flip({crossAxis: false}), shift({padding: 8})],
  whileElementsMounted: autoUpdate,
})

function onLeafSelect(item: ContextMenuItem) {
  emit("select", [item])
}

function onChildSelect(childPath: ContextMenuItem[]) {
  if (activeSubmenuItem.value) {
    emit("select", [activeSubmenuItem.value, ...childPath])
  }
}

watch(submenuPanelRef, (newEl, oldEl) => {
  if (oldEl) unregisterSubmenu(oldEl)
  if (newEl) registerSubmenu(newEl)
})

onBeforeUnmount(() => {
  if (submenuPanelRef.value) unregisterSubmenu(submenuPanelRef.value)
  navigation.cleanup()
})
</script>

<template>
  <MenuList
    :items="items"
    :active-value="activeSubmenuItem && !activeSubmenuItem.separator ? activeSubmenuItem.value : null"
    @select="onLeafSelect"
    @item-hover="navigation.onItemHover"
    @item-leave="navigation.onItemLeave"
    @mousemove="navigation.trackMouse"
  />

  <Teleport to="body">
    <div
      v-if="hasSubmenu"
      ref="submenuPanelRef"
      :style="floatingStyles"
      class="bg-base-100 border-base-300 z-50 min-w-44 rounded-lg border shadow-lg"
      @mouseenter="navigation.onSubmenuMouseenter"
      @mouseleave="navigation.onSubmenuMouseleave"
    >
      <MenuPanel
        v-if="hasChildrenSubmenu && activeSubmenuItem && !activeSubmenuItem.separator"
        :items="activeSubmenuItem.children as ContextMenuItem[]"
        :submenu-prefers-left="submenuPrefersLeft"
        @select="onChildSelect"
      />

      <component
        :is="() => contextMenuSlots[submenuSlotName!]()"
        v-else-if="hasSlotSubmenu && submenuSlotName && contextMenuSlots[submenuSlotName]"
      />
    </div>
  </Teleport>
</template>
