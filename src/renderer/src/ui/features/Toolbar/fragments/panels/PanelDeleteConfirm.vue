<script setup lang="ts">
import {computed, useTemplateRef} from "vue"
import {useProgressFill} from "@/composables/useProgressFill"
import {useThemeStore} from "@/stores/theme.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const emit = defineEmits<{delete: []; cancel: []}>()

const themeStore = useThemeStore()

const deleteBlockRef = useTemplateRef<HTMLDivElement>("deleteBlock")

useProgressFill(deleteBlockRef, {
  color: computed(() => themeStore.currentTheme.colorScheme.error),
  duration: 500,
  onComplete: () => emit("delete"),
})
</script>

<template>
  <div class="bg-background flex size-full flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:justify-between">
    <div
      class="border-base-300 bg-base-100 hover:bg-base-200 flex w-full items-center gap-2 rounded-lg border p-1 px-6 transition-colors md:w-auto md:cursor-default md:border-none md:bg-transparent md:p-0"
    >
      <div class="text-warning flex w-full items-center justify-center gap-2">
        <BaseIcon name="hand-raised" class="size-4" />
        <span class="text-base md:select-none"> Confirm delete </span>
      </div>
    </div>

    <div class="text-foreground flex w-full touch-none items-center justify-center gap-2 overflow-hidden select-none md:w-fit">
      <BaseButton variant="text" icon-class="size-4" icon="undo" @click="emit('cancel')"> Cancel </BaseButton>

      <div class="flex flex-1 items-center justify-center gap-3 rounded-sm md:p-2">
        <div
          ref="deleteBlock"
          class="bg-error/20 border-error/50 hover:bg-error/40 text-foreground flex w-full  items-center justify-center gap-2 rounded-sm border p-1.5 px-3 transition-colors duration-200"
        >
          <BaseIcon name="touch-hold" class="relative size-5" />
          <span class="relative text-base">Hold here to delete</span>
        </div>
      </div>
    </div>
  </div>
</template>
