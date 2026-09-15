<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "./BaseIcon"

import type {HTMLAttributes} from "vue"
import type {IconName} from "./BaseIcon"

export type BaseMenuItem = {
  value?: string
  label?: string
  icon?: IconName
  classLabel?: HTMLAttributes["class"]
}

defineProps<{items: BaseMenuItem[]}>()
const emit = defineEmits<{select: [value: BaseMenuItem["value"]]}>()

function getLabelClasses(classLabel: BaseMenuItem["classLabel"]) {
  return cn("flex-1 truncate text-sm", classLabel)
}
</script>

<template>
  <ul class="size-full">
    <li v-for="item in items" :key="item.value">
      <button
        type="button"
        :data-menu-item="item.value"
        class="focus-visible-accent w-full rounded-md outline-none"
        @click="emit('select', item.value)"
      >
        <span class="text-base-content hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors">
          <BaseIcon v-if="item.icon" :name="item.icon" class="size-4.5" />
          <span :class="getLabelClasses(item.classLabel)">{{ item.label }}</span>
        </span>
      </button>
    </li>
  </ul>
</template>
