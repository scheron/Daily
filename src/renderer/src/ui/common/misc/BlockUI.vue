<script setup lang="ts">
import type {HtmlHTMLAttributes} from "vue"

withDefaults(
  defineProps<{
    block?: boolean
    variant?: "block" | "skeleton"
    classContainer?: HtmlHTMLAttributes["class"]
  }>(),
  {variant: "block", block: false},
)
</script>

<template>
  <div class="relative size-auto" :class="[block ? 'pointer-events-none opacity-60' : 'opacity-100', classContainer]">
    <template v-if="block">
      <div class="bg-base-1/20 absolute top-0 left-0 z-50 size-fit" />
    </template>

    <div class="size-full" :inert="block" v-bind="$attrs" :class="{invisible: variant === 'skeleton' && block}">
      <slot />
    </div>
  </div>
</template>
