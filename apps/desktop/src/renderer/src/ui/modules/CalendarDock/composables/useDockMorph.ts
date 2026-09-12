import {nextTick, watch} from "vue"

import type {Ref} from "vue"

type DockFrame = {width: string; height: string; borderRadius: string}

const EXPAND_TIMING: KeyframeAnimationOptions = {duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)"}
const COLLAPSE_TIMING: KeyframeAnimationOptions = {duration: 300, easing: "cubic-bezier(0.4, 0, 1, 1)"}

/**
 * Animates the dock between its collapsed and expanded size, measuring the element before the
 * DOM updates and again after, then morphing width, height and corner radius between the two.
 * The surface carries no padding in either state — the inset belongs to the content — so there
 * is nothing about the animating box that can change in a single step.
 * @param target - The dock's visible surface; it keeps its identity across both states and pins its content bottom-centre.
 * @param expanded - Whether the dock is expanded; every change of it runs one morph.
 */
export function useDockMorph(target: Ref<HTMLElement | null>, expanded: () => boolean): void {
  let running: Animation | null = null
  let overflowBeforeMorph: string | null = null

  watch(expanded, async (isExpanded) => {
    const before = target.value
    if (!canAnimate(before)) return

    const from = measure(before)
    await nextTick()

    const node = target.value
    if (!canAnimate(node)) return

    const to = measure(node)

    node.getAnimations().forEach((animation) => animation.cancel())

    if (overflowBeforeMorph === null) overflowBeforeMorph = node.style.overflow
    node.style.overflow = "hidden"

    const timing = isExpanded ? EXPAND_TIMING : COLLAPSE_TIMING
    const animation = node.animate([from, to], timing)
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

function canAnimate(node: HTMLElement | null): node is HTMLElement {
  return Boolean(node) && typeof node!.animate === "function"
}

function measure(node: HTMLElement): DockFrame {
  return {
    width: `${node.offsetWidth}px`,
    height: `${node.offsetHeight}px`,
    borderRadius: getComputedStyle(node).borderRadius,
  }
}
