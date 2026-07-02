<script setup lang="ts">
import {ACCENT_PRESETS} from "@shared/constants/theme"
import {useThemeStore} from "@/stores/theme.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

const themeStore = useThemeStore()
</script>

<template>
  <div class="flex items-center gap-1">
    <BaseButton
      v-for="preset in ACCENT_PRESETS"
      :key="preset.id"
      type="button"
      variant="ghost"
      :tooltip="preset.name"
      class="focus-visible-accent group relative size-6 rounded-md p-0 transition-transform duration-200 hover:scale-110"
      @click="themeStore.setAccent(preset.id)"
    >
      <span
        class="absolute inset-0 size-full rounded-md transition-opacity group-hover:opacity-100!"
        :class="[preset.id === themeStore.accentId ? 'scale-110 opacity-100' : 'opacity-40']"
        :style="{backgroundColor: preset.value}"
      />
      <BaseIcon v-if="preset.id === themeStore.accentId" name="check" class="size-4 text-black" />
    </BaseButton>
  </div>
</template>
