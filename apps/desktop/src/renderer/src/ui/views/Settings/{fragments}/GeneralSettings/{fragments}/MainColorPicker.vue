<script setup lang="ts">
import {BASE_PRESETS} from "@daily/protocol"

import {useThemeStore} from "@/stores/theme"
import BaseButton from "@/ui/base/BaseButton"
import {cn} from "@/utils/ui/tailwindcss"

const themeStore = useThemeStore()

function getBaseSwatchClasses(isActive: boolean) {
  return cn(
    "border-base-content/20 absolute inset-0 size-full overflow-hidden rounded-md border transition-opacity group-hover:opacity-100!",
    isActive ? "scale-110 opacity-100" : "opacity-40",
  )
}
</script>

<template>
  <div class="flex items-center gap-1">
    <BaseButton
      v-for="preset in BASE_PRESETS"
      :key="preset.id"
      type="button"
      variant="ghost"
      :tooltip="preset.name"
      class="focus-visible-accent group relative size-6 rounded-md p-0 transition-transform duration-200 hover:scale-110"
      @click="themeStore.setBase(preset.id)"
    >
      <span :class="getBaseSwatchClasses(preset.id === themeStore.baseId)">
        <span class="absolute inset-0" :style="{backgroundColor: preset.light.base100}" />
        <span class="absolute inset-0" :style="{backgroundColor: preset.dark.base100, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'}" />
      </span>
    </BaseButton>
  </div>
</template>
