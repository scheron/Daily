<script setup lang="ts">
import BaseIcon from "./BaseIcon.vue"

import type {IconName} from "@/types/icons"

export type BaseMenuItem = {
  value?: string
  label?: string
  icon?: IconName
  selected?: boolean
}

defineProps<{items: BaseMenuItem[]}>()
const emit = defineEmits<{select: [value: BaseMenuItem["value"]]}>()
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
          <span class="flex-1 truncate text-sm">{{ item.label }}</span>
          <BaseIcon v-if="item.selected" name="check" class="text-base-content/60 size-4 shrink-0" />
        </span>
      </button>
    </li>
  </ul>
</template>
