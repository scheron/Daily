<script setup lang="ts">
import {hasSubmenu} from "@/ui/base/BaseContextMenu/{fragments}/MenuPanel/utils/hasSubmenu"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {BaseContextMenuItem, BaseContextMenuLabeledItem} from "@/ui/base/BaseContextMenu/types"
import type {HTMLAttributes, Slot} from "vue"

const props = defineProps<{items: BaseContextMenuItem[]; activeValue?: string | null; itemSlots?: Record<string, Slot>}>()
const emit = defineEmits<{select: [BaseContextMenuItem]; "item-hover": [item: BaseContextMenuItem, el: HTMLElement]; "item-leave": []}>()

function getRowClasses(isSeparator: boolean) {
  return cn(isSeparator && "my-1")
}

function getItemClasses(hasChildren: boolean, isActive: boolean, isDisabled: boolean, itemClass: HTMLAttributes["class"]) {
  return cn(
    "text-base-content hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors",
    hasChildren ? "pr-1 pl-3" : "px-3",
    isActive && "bg-base-content/10",
    isDisabled && "pointer-events-none opacity-50",
    itemClass,
  )
}

function getIconClasses(classIcon: HTMLAttributes["class"]) {
  return cn("size-4.5", classIcon)
}

function getLabelClasses(classLabel: HTMLAttributes["class"]) {
  return cn("flex-1 truncate text-sm", classLabel)
}

function isMenuItem(item: BaseContextMenuItem): item is BaseContextMenuLabeledItem {
  return !item.separator
}

function getItemSlotName(item: BaseContextMenuLabeledItem) {
  return `item-${item.value}`
}

function hasItemSlot(item: BaseContextMenuItem): boolean {
  if (!isMenuItem(item)) return false
  return !!props.itemSlots?.[getItemSlotName(item)]
}

function onItemMouseenter(item: BaseContextMenuItem, event: MouseEvent) {
  if (item.separator || item.disabled) return
  emit("item-hover", item, event.currentTarget as HTMLElement)
}

function renderItemSlot(item: BaseContextMenuItem) {
  if (!isMenuItem(item)) return null

  const slot = props.itemSlots?.[getItemSlotName(item)]
  return slot?.(item) ?? null
}

function onItemClick(item: BaseContextMenuItem) {
  if (hasSubmenu(item)) return
  emit("select", item)
}
</script>

<template>
  <ul class="overflow-hidden p-1" @mouseleave="emit('item-leave')">
    <li v-for="(item, i) in items" :key="item.separator ? `sep-${i}` : item.value" :class="getRowClasses(!!item.separator)">
      <div v-if="item.separator" class="relative h-px w-full">
        <span class="bg-base-300 absolute inset-0 block h-px w-full scale-x-200"></span>
      </div>

      <component :is="() => renderItemSlot(item)" v-else-if="hasItemSlot(item)" />

      <button
        v-else
        type="button"
        :data-menu-item="item.value"
        class="focus-visible-accent w-full rounded-md outline-none"
        :disabled="item.disabled"
        @click="onItemClick(item)"
        @mouseenter="onItemMouseenter(item, $event)"
      >
        <span :class="getItemClasses(hasSubmenu(item), activeValue === item.value, !!item.disabled, item.class)">
          <BaseIcon v-if="item.icon" :name="item.icon" :class="getIconClasses(item.classIcon)" />
          <span :class="getLabelClasses(item.classLabel)">{{ item.label }}</span>
          <BaseIcon v-if="hasSubmenu(item)" name="chevron-right" class="ml-auto size-4 opacity-60" />
        </span>
      </button>
    </li>
  </ul>
</template>
