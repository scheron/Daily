<script setup lang="ts" generic="T extends string">
import {HTMLAttributes} from "vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"

import BaseIcon from "@/ui/base/BaseIcon"

import {useTabAnimation} from "./useTabAnimation"

export type AnimatedTab<T extends string = string> = {
  id: T
  label: string
  icon?: IconName
  tooltip?: string
  activeClass?: HTMLAttributes["class"]
  inactiveClass?: HTMLAttributes["class"]
}

const props = defineProps<{tab: T; tabs: AnimatedTab<T>[]; tabClass?: HTMLAttributes["class"]}>()
const emit = defineEmits<{"update:tab": [value: T]}>()

const {animateChange} = useTabAnimation<T>("container")

async function onTabSelect(tabId: T) {
  await animateChange(props.tab, tabId)
  emit("update:tab", tabId)
}
</script>

<template>
  <div ref="container" class="flex items-center gap-1">
    <button
      v-for="item in tabs"
      :key="item.id"
      v-tooltip="{disabled: tab === item.id, content: item.label, placement: 'top'}"
      :data-tab="item.id"
      :class="cn(tabClass, tab === item.id ? item.activeClass : item.inactiveClass)"
      @click="onTabSelect(item.id)"
    >
      <slot :name="`tab-${item.id}`">
        <slot :name="`tab-icon-${item.id}`">
          <BaseIcon v-if="item.icon" :name="item.icon" class="size-5" />
        </slot>
        <span
          v-if="item.label"
          data-name="label"
          class="invisible max-w-0 overflow-hidden text-sm whitespace-nowrap opacity-0 transition-opacity"
          :class="{'visible max-w-full opacity-100': tab === item.id}"
        >
          {{ item.label }}
        </span>
      </slot>
    </button>
  </div>
</template>
