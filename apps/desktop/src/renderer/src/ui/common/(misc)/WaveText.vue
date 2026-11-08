<script setup lang="ts">
import {computed} from "vue"

const props = defineProps<{text: string}>()

const characters = computed(() =>
  props.text.split("").map((char, i) => ({
    char: char === " " ? "\u00A0" : char,
    delay: `${(i * 0.1).toFixed(2)}s`,
  })),
)
</script>

<template>
  <span class="wave-text">
    <span v-for="(ch, i) in characters" :key="i" class="wave-char" :style="{animationDelay: ch.delay, animationDuration: '2.4s'}">{{ ch.char }}</span>
  </span>
</template>

<style scoped>
.wave-text {
  display: inline;
}

.wave-char {
  display: inline-block;
  animation: wave-bounce infinite ease-in-out;
  opacity: 0.4;
}

@keyframes wave-bounce {
  0%,
  80%,
  100% {
    opacity: 0.4;
  }
  40% {
    opacity: 1;
  }
}
</style>
