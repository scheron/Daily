import {computed, ref, toValue} from "vue"

import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"

import type {MaybeRefOrGetter} from "vue"

export function useMenuPosition(menuRef: MaybeRefOrGetter<HTMLElement | null>) {
  const mousePosition = ref({x: 0, y: 0})

  const virtualEl = computed(() => ({
    getBoundingClientRect() {
      return {
        x: mousePosition.value.x,
        y: mousePosition.value.y,
        top: mousePosition.value.y,
        left: mousePosition.value.x,
        bottom: mousePosition.value.y,
        right: mousePosition.value.x,
        width: 0,
        height: 0,
      }
    },
  }))

  const {floatingStyles} = useFloating(
    virtualEl,
    computed(() => toValue(menuRef)),
    {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [offset(4), flip(), shift({padding: 8})],
      whileElementsMounted: autoUpdate,
    },
  )

  function setPosition(event: MouseEvent) {
    mousePosition.value = {x: event.clientX, y: event.clientY}
  }

  return {floatingStyles, setPosition}
}
