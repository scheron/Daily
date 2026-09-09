<script setup lang="ts">
import {computed} from "vue"

const CODE_HALF = 3

const props = defineProps<{
  code: string
  hint?: string
}>()

const formattedCode = computed(() => `${props.code.slice(0, CODE_HALF)} ${props.code.slice(CODE_HALF)}`)
</script>

<template>
  <div class="border-base-300 bg-base-200/60 border-b border-t px-5 pb-[18px] pt-[22px] text-center">
    <p class="pl-[0.3em] font-mono text-[40px] font-semibold tabular-nums leading-[1.1] tracking-[0.3em]">{{ formattedCode }}</p>
    <p v-if="hint" class="text-base-content/55 mt-2.5 text-xs">{{ hint }}</p>
  </div>
</template>
