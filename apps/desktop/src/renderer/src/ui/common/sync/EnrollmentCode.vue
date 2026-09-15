<script setup lang="ts">
import {computed} from "vue"

const props = defineProps<{
  code: string
  hint?: string
}>()

const formattedCode = computed(() => `${props.code.slice(0, 3)} ${props.code.slice(3)}`)
</script>

<template>
  <div class="border-base-300 bg-base-200/60 border-t border-b px-5 pt-[22px] pb-[18px] text-center">
    <p class="pl-[0.3em] font-mono text-[40px] leading-[1.1] font-semibold tracking-[0.3em] tabular-nums">{{ formattedCode }}</p>
    <p v-if="hint" class="text-base-content/55 mt-2.5 text-xs">{{ hint }}</p>
  </div>
</template>
