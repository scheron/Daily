<script setup lang="ts">
import {computed, onBeforeUnmount, useTemplateRef, watch} from "vue"

import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import {useContextMenuConsumer} from "../composables/useContextMenuProvider"
import {useSubmenuNavigation} from "../composables/useSubmenuNavigation"
import MenuList from "./MenuList.vue"

import type {ContextMenuItem, ContextMenuSelectEvent} from "../types"

const SUBMENU_PREFIX = "child-"

const props = defineProps<{items: ContextMenuItem[]; submenuPrefersLeft?: boolean}>()
const emit = defineEmits<{select: [path: ContextMenuSelectEvent]}>()

const submenuPanelRef = useTemplateRef("submenuPanel")

const {contextMenuSlots, registerSubmenu, unregisterSubmenu} = useContextMenuConsumer()
const {activeSubmenuItem, activeSubmenuEl, ...navigation} = useSubmenuNavigation(submenuPanelRef)

const {floatingStyles} = useFloating(activeSubmenuEl, submenuPanelRef, {
  strategy: "fixed",
  placement: computed(() => (props.submenuPrefersLeft ? "left-start" : "right-start")),
  middleware: [offset(4), flip({crossAxis: false}), shift({padding: 8})],
  whileElementsMounted: autoUpdate,
})

const hasChildrenSubmenu = computed(() => {
  return !!(activeSubmenuItem.value && !activeSubmenuItem.value.separator && Array.isArray(activeSubmenuItem.value.children))
})
const hasSlotSubmenu = computed(() => {
  return !!(activeSubmenuItem.value && !activeSubmenuItem.value.separator && activeSubmenuItem.value.children === true)
})
const hasSubmenu = computed(() => hasChildrenSubmenu.value || hasSlotSubmenu.value)

const submenuSlotName = computed(() => {
  if (!hasSlotSubmenu.value || !activeSubmenuItem.value || activeSubmenuItem.value.separator) return null
  return `${SUBMENU_PREFIX}${activeSubmenuItem.value.value}`
})

function onLeafSelect(item: ContextMenuItem) {
  emit("select", {item, parent: null})
}

function onChildSelect(childPath: ContextMenuSelectEvent) {
  if (!activeSubmenuItem.value) return

  emit("select", withParent(childPath, activeSubmenuItem.value))
}

function withParent(path: ContextMenuSelectEvent, parentItem: ContextMenuItem): ContextMenuSelectEvent {
  if (!path.parent) return {...path, parent: {item: parentItem, parent: null}}
  return {...path, parent: withParent(path.parent, parentItem)}
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
    :item-slots="contextMenuSlots"
    @select="onLeafSelect"
    @item-hover="navigation.onItemHover"
    @item-leave="navigation.onItemLeave"
    @mousemove="navigation.trackMouse"
  />

  <Teleport to="body">
    <div
      v-if="hasSubmenu"
      ref="submenuPanel"
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
