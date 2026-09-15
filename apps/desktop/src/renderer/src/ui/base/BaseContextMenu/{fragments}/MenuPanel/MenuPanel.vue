<script setup lang="ts">
import {computed, onBeforeUnmount, useTemplateRef, watch} from "vue"

import {isArray} from "@daily/std"

import {useContextMenuConsumer} from "@/ui/base/BaseContextMenu/composables/useContextMenuProvider"
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import MenuList from "./{fragments}/MenuList.vue"
import {useSubmenuNavigation} from "./useSubmenuNavigation"

import type {BaseContextMenuItem, BaseContextMenuSelectEvent} from "@/ui/base/BaseContextMenu/types"

defineProps<{items: BaseContextMenuItem[]}>()
const emit = defineEmits<{select: [path: BaseContextMenuSelectEvent]}>()

const submenuPanelRef = useTemplateRef("submenuPanel")

const {activeSubmenuItem, activeSubmenuEl, ...navigation} = useSubmenuNavigation(submenuPanelRef)

const hasChildrenSubmenu = computed(() => {
  return !!(activeSubmenuItem.value && !activeSubmenuItem.value.separator && isArray(activeSubmenuItem.value.children))
})
const hasSlotSubmenu = computed(() => {
  return !!(activeSubmenuItem.value && !activeSubmenuItem.value.separator && activeSubmenuItem.value.children === true)
})
const hasSubmenu = computed(() => hasChildrenSubmenu.value || hasSlotSubmenu.value)

const submenuSlotName = computed(() => {
  if (!hasSlotSubmenu.value || !activeSubmenuItem.value || activeSubmenuItem.value.separator) return null
  return `child-${activeSubmenuItem.value.value}`
})

const {contextMenuSlots, registerSubmenu, unregisterSubmenu} = useContextMenuConsumer()

const {floatingStyles} = useFloating(activeSubmenuEl, submenuPanelRef, {
  strategy: "fixed",
  placement: "right-start",
  middleware: [offset(4), flip({crossAxis: false}), shift({padding: 8})],
  whileElementsMounted: autoUpdate,
})

function onLeafSelect(item: BaseContextMenuItem) {
  emit("select", {item, parent: null})
}

function onChildSelect(childPath: BaseContextMenuSelectEvent) {
  if (!activeSubmenuItem.value) return

  emit("select", withParent(childPath, activeSubmenuItem.value))
}

function withParent(path: BaseContextMenuSelectEvent, parentItem: BaseContextMenuItem): BaseContextMenuSelectEvent {
  if (!path.parent) return {...path, parent: {item: parentItem, parent: null}}
  return {...path, parent: withParent(path.parent, parentItem)}
}

watch(submenuPanelRef, (newEl, oldEl) => {
  if (oldEl) unregisterSubmenu(oldEl)
  if (newEl) registerSubmenu(newEl)
})

onBeforeUnmount(() => {
  if (submenuPanelRef.value) unregisterSubmenu(submenuPanelRef.value)
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
        :items="activeSubmenuItem.children as BaseContextMenuItem[]"
        @select="onChildSelect"
      />

      <component
        :is="() => contextMenuSlots[submenuSlotName!]()"
        v-else-if="hasSlotSubmenu && submenuSlotName && contextMenuSlots[submenuSlotName]"
      />
    </div>
  </Teleport>
</template>
