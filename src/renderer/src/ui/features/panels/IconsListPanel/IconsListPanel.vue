<script setup lang="ts">
import {onBeforeMount, ref} from "vue"

import BaseIcon, {IconName} from "@/ui/base/BaseIcon"

const icons = ref<IconName[]>([])

onBeforeMount(() => {
  const _icons = document.querySelectorAll("svg symbol")
  icons.value = Array.from(_icons).map((icon) => icon.id as IconName)
})
</script>

<template>
  <div class="overflow-y-auto">
    <div class="grid grid-cols-3 gap-3">
      <div
        v-for="icon in icons"
        :key="icon"
        class="hover:bg-base-200 group flex cursor-pointer flex-col items-center justify-center rounded-md p-2 transition-colors"
      >
        <BaseIcon :name="icon" class="text-accent group-hover:text-accent-focus size-5 transition-colors" />
        <span class="mt-2 text-center text-xs">
          {{ icon }}
        </span>
      </div>
    </div>
  </div>
</template>
