<script setup lang="ts">
import {HTMLAttributes} from "vue"

import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import type {IconName} from "@/ui/base/BaseIcon"

export type BaseMenuItem = {
  value?: string
  label?: string
  icon?: IconName
  separator?: boolean
  disabled?: boolean
  classIcon?: HTMLAttributes["class"]
  classLabel?: HTMLAttributes["class"]
  class?: HTMLAttributes["class"]
}

const props = defineProps<{items: BaseMenuItem[]; class?: HTMLAttributes["class"]}>()
const emit = defineEmits<{select: [value: BaseMenuItem["value"] | null]}>()

function getItemClass(item: BaseMenuItem) {
  const baseClass = "text-base-content hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors"

  return cn(baseClass, item.disabled && "pointer-events-none opacity-50", item.class)
}

function onItemClick(value: BaseMenuItem["value"]) {
  if (props.items.find((item) => item.value === value)?.disabled) return
  emit("select", value)
}
</script>

<template>
  <ul :class="cn('size-full p-1', props.class)">
    <li v-for="(item, i) in items" :key="item.separator ? `sep-${i}` : item.value" :class="{'my-1': item.separator}">
      <div v-if="item.separator" class="relative h-px w-full">
        <span class="bg-base-300 absolute inset-0 block h-px w-full scale-x-200"></span>
      </div>

      <button
        v-else
        type="button"
        :data-menu-item="item.value"
        class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent w-full rounded-md outline-none"
        :disabled="item.disabled"
        @click="onItemClick(item.value)"
      >
        <span :class="getItemClass(item)">
          <slot name="item" :item="item" :value="item.value">
            <BaseIcon v-if="item.icon" :name="item.icon" :class="cn(item.classIcon, 'size-4.5')" />
            <span class="flex-1 truncate text-sm" :class="item.classLabel">{{ item.label }}</span>
          </slot>
        </span>
      </button>
    </li>
  </ul>
</template>
