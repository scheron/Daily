import {computed, ref} from "vue"

// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"

import type {Ref} from "vue"

export function useMenuPosition(menuRef: Ref<HTMLElement | null>) {
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

  const {floatingStyles} = useFloating(virtualEl, menuRef, {
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [offset(4), flip(), shift({padding: 8})],
    whileElementsMounted: autoUpdate,
  })

  function setPosition(positionOrEvent: {x: number; y: number} | MouseEvent) {
    if (positionOrEvent instanceof MouseEvent) {
      mousePosition.value = {x: positionOrEvent.clientX, y: positionOrEvent.clientY}
    } else {
      mousePosition.value = {x: positionOrEvent.x, y: positionOrEvent.y}
    }
  }

  return {floatingStyles, setPosition}
}
