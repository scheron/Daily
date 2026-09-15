<script setup lang="ts">
import {computed} from "vue"

const props = withDefaults(
  defineProps<{
    name: "fade" | "dropIn"
    duration?: number
  }>(),
  {
    duration: 100,
  },
)

const variant = computed(() => {
  const classesByName = {
    fade: {
      enterFrom: "opacity-0",
      leaveTo: "opacity-0",
      enterActive: `transition duration-${props.duration}`,
      leaveActive: `transition duration-${props.duration}`,
    },
    dropIn: {
      enterFrom: "-translate-y-2 opacity-0",
      leaveTo: "-translate-y-2 opacity-0",
      enterActive: `transition-all duration-${props.duration} ease-out`,
      leaveActive: `transition-all duration-${props.duration} ease-in`,
    },
  }

  return classesByName[props.name]
})
</script>

<template>
  <Transition
    :enter-from-class="variant.enterFrom"
    :leave-to-class="variant.leaveTo"
    :enter-active-class="variant.enterActive"
    :leave-active-class="variant.leaveActive"
  >
    <slot />
  </Transition>
</template>
