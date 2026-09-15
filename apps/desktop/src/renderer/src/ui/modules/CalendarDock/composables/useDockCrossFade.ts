import {watch} from "vue"
import {storeToRefs} from "pinia"

import {useUIStore} from "@/stores/ui"

import type {ShallowRef} from "vue"

export function useDockCrossFade(dock: Readonly<ShallowRef<HTMLElement | null>>) {
  const uiStore = useUIStore()
  const {isCalendarDockExpanded} = storeToRefs(uiStore)

  let panelWidthBeforeCollapse = 0

  function onEnter(el: Element, done: () => void) {
    const node = el as HTMLElement
    if (typeof node.animate !== "function") return done()

    const {enter, timing} = crossFadeFor(isCalendarDockExpanded.value)
    node.style.width = `${node.offsetWidth}px`

    node.animate(enter, timing).finished.then(() => {
      node.style.width = ""
      done()
    }, done)
  }

  function onLeave(el: Element, done: () => void) {
    const node = el as HTMLElement
    const surface = dock.value
    if (!surface || typeof node.animate !== "function") return done()

    const {leave, timing} = crossFadeFor(isCalendarDockExpanded.value)
    const {opacity, transform} = getComputedStyle(node)
    const width = panelWidthBeforeCollapse || node.offsetWidth

    node.getAnimations().forEach((animation) => animation.cancel())

    const borderBottom = parseFloat(getComputedStyle(surface).borderBottomWidth) || 0
    const bottom = surface.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom - borderBottom

    Object.assign(node.style, {
      position: "absolute",
      left: "50%",
      bottom: `${bottom}px`,
      width: `${width}px`,
      translate: "-50% 0",
      pointerEvents: "none",
    })

    node.animate([{opacity, transform}, ...leave], timing).finished.then(done, done)
  }

  watch(
    isCalendarDockExpanded,
    (isExpanded) => {
      if (isExpanded) return
      const panel = dock.value?.querySelector<HTMLElement>(":scope > div")
      panelWidthBeforeCollapse = panel?.offsetWidth ?? 0
    },
    {flush: "sync"},
  )

  return {onEnter, onLeave}
}

function crossFadeFor(isExpanded: boolean) {
  if (isExpanded) {
    return {
      timing: {duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)"},
      enter: [
        {opacity: 0, transform: "translateY(10px)"},
        {opacity: 0, transform: "translateY(10px)", offset: 0.5},
        {opacity: 1, transform: "translateY(0)"},
      ],
      leave: [
        {opacity: 0, transform: "none", offset: 1 / 3},
        {opacity: 0, transform: "none"},
      ],
    }
  }
  return {
    timing: {duration: 300, easing: "cubic-bezier(0.4, 0, 1, 1)"},
    enter: [{opacity: 0}, {opacity: 0, offset: 0.3}, {opacity: 1}],
    leave: [
      {opacity: 0, transform: "translateY(10px)", offset: 0.6},
      {opacity: 0, transform: "translateY(10px)"},
    ],
  }
}
