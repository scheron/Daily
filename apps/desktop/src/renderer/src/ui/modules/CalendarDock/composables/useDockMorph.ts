import {nextTick, toValue, watch} from "vue"
import {storeToRefs} from "pinia"

import {useUiStore} from "@/stores/ui"

import type {CalendarDockTab} from "@/stores/ui"
import type {MaybeRefOrGetter} from "vue"

export function useDockMorph(dock: MaybeRefOrGetter<HTMLElement | null>, tab: MaybeRefOrGetter<CalendarDockTab>) {
  const uiStore = useUiStore()
  const {isCalendarDockExpanded} = storeToRefs(uiStore)

  let running: Animation | null = null
  let overflowBeforeMorph: string | null = null
  let wasExpanded = isCalendarDockExpanded.value

  watch([isCalendarDockExpanded, () => toValue(tab)], async ([isExpanded]) => {
    const isToggled = isExpanded !== wasExpanded
    wasExpanded = isExpanded

    if (!isExpanded && !isToggled) return

    const before = toValue(dock)
    if (!canAnimate(before)) return

    const from = measure(before)
    await nextTick()

    const node = toValue(dock)
    if (!canAnimate(node)) return

    const to = measure(node)

    node.getAnimations().forEach((animation) => animation.cancel())

    if (overflowBeforeMorph === null) overflowBeforeMorph = node.style.overflow
    node.style.overflow = "hidden"

    const animation = node.animate([from, to], morphTimingFor(isToggled, isExpanded))
    running = animation

    const settle = () => {
      if (running !== animation) return
      running = null
      node.style.overflow = overflowBeforeMorph ?? ""
      overflowBeforeMorph = null
    }
    animation.finished.then(settle, settle)
  })
}

function morphTimingFor(isToggled: boolean, isExpanded: boolean) {
  if (!isToggled) return {duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)"}
  if (isExpanded) return {duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)"}
  return {duration: 300, easing: "cubic-bezier(0.4, 0, 1, 1)"}
}

function canAnimate(node: HTMLElement | null): node is HTMLElement {
  return Boolean(node) && typeof node!.animate === "function"
}

function measure(node: HTMLElement) {
  return {
    width: `${node.offsetWidth}px`,
    height: `${node.offsetHeight}px`,
    borderRadius: getComputedStyle(node).borderRadius,
  }
}
