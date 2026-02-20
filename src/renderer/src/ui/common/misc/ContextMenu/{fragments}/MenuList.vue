<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import type {Slot} from "vue"
import type {ContextMenuItem} from "../types"

type MenuItem = Extract<ContextMenuItem, {separator?: false}>

const props = defineProps<{items: ContextMenuItem[]; activeValue?: string | null; itemSlots?: Record<string, Slot>}>()
const emit = defineEmits<{select: [ContextMenuItem]; "item-hover": [item: ContextMenuItem, el: HTMLElement]; "item-leave": []}>()

function getItemClass(item: ContextMenuItem): string {
  const baseClass = "text-base-content hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors"

  return cn(
    baseClass,
    hasSubmenu(item) ? "pr-1 pl-3" : "px-3",
    props.activeValue === item.value && "bg-base-content/10",
    item.disabled && "pointer-events-none opacity-50",
    item.class,
  )
}

function hasSubmenu(item: ContextMenuItem): boolean {
  if (item.separator) return false
  return !!item.children
}

function isMenuItem(item: ContextMenuItem): item is MenuItem {
  return !item.separator
}

function getItemSlotName(item: MenuItem) {
  return `item-${item.value}`
}

function hasItemSlot(item: ContextMenuItem): boolean {
  if (!isMenuItem(item)) return false
  return !!props.itemSlots?.[getItemSlotName(item)]
}

function onItemMouseenter(item: ContextMenuItem, event: MouseEvent) {
  if (item.separator || item.disabled) return
  emit("item-hover", item, event.currentTarget as HTMLElement)
}

function renderItemSlot(item: ContextMenuItem) {
  if (!isMenuItem(item)) return null

  const slot = props.itemSlots?.[getItemSlotName(item)]
  return slot?.(item) ?? null
}

function onItemClick(item: ContextMenuItem) {
  if (hasSubmenu(item)) return
  emit("select", item)
}
</script>

<template>
  <ul class="overflow-hidden p-1" @mouseleave="emit('item-leave')">
    <li v-for="(item, i) in items" :key="item.separator ? `sep-${i}` : item.value" :class="{'my-1': item.separator}">
      <div v-if="item.separator" class="relative h-px w-full">
        <span class="bg-base-300 absolute inset-0 block h-px w-full scale-x-200"></span>
      </div>

      <component :is="() => renderItemSlot(item)" v-else-if="hasItemSlot(item)" />

      <button
        v-else
        type="button"
        :data-menu-item="item.value"
        class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent w-full rounded-md outline-none"
        :disabled="item.disabled"
        @click="onItemClick(item)"
        @mouseenter="onItemMouseenter(item, $event)"
      >
        <span :class="getItemClass(item)">
          <BaseIcon v-if="item.icon" :name="item.icon" :class="cn(item.classIcon, 'size-4.5')" />
          <span class="flex-1 truncate text-sm" :class="item.classLabel">{{ item.label }}</span>
          <BaseIcon v-if="hasSubmenu(item)" name="chevron-right" class="ml-auto size-4 opacity-60" />
        </span>
      </button>
    </li>
  </ul>
</template>
