<script setup lang="ts">
import {computed} from "vue"

const props = withDefaults(
  defineProps<{
    text: string
    /** Delay step between characters in seconds */
    delayStep?: number
    /** Total animation duration per character in seconds */
    duration?: number
  }>(),
  {
    delayStep: 0.1,
    duration: 2.4,
  },
)

const characters = computed(() =>
  props.text.split("").map((char, i) => ({
    char: char === " " ? "\u00A0" : char,
    delay: `${(i * props.delayStep).toFixed(2)}s`,
  })),
)
</script>

<template>
  <span class="wave-text">
    <span
      v-for="(ch, i) in characters"
      :key="i"
      class="wave-char"
      :style="{
        animationDelay: ch.delay,
        animationDuration: `${duration}s`,
      }"
      >{{ ch.char }}</span
    >
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
