import {TooltipController} from "@/utils/ui/TooltipController"

import type {TooltipOptions} from "@/utils/ui/TooltipController"
import type {Directive, DirectiveBinding} from "vue"

type TooltipBinding = string | TooltipOptions

const controller = new TooltipController()
const HANDLERS = Symbol("tooltip")

/**
 * v-tooltip directive
 * @param {string | TooltipOptions} value - The content of the tooltip or the options object
 * @property {string} content - The content of the tooltip
 * @property {TooltipPlacement} placement - The placement of the tooltip
 * @property {number} delay - The delay before the tooltip is shown
 * @property {number} offset - The offset of the tooltip
 * @property {boolean} disabled - Whether the tooltip is disabled
 * @description Displays a tooltip when the element is hovered or focused
 * @example
 * <template>
 *   <div v-tooltip="'Tooltip content'">Hello</div>
 * </template>
 */
export default {
  mounted(el, binding) {
    controller.register()
    const opts = parse(binding)
    if (opts.content && !opts.disabled) attach(el, opts)
  },

  updated(el, binding) {
    const opts = parse(binding)
    if (!opts.content || opts.disabled) {
      detach(el)
      controller.hideIfTarget(el)
    } else {
      attach(el, opts)
    }
  },

  beforeUnmount(el) {
    detach(el)
    controller.hideIfTarget(el)
    controller.unregister()
  },
} as Directive<HTMLElement, TooltipBinding>

declare global {
  interface HTMLElement {
    [HANDLERS]?: {enter: () => void; leave: () => void}
  }
}

function parse(binding: DirectiveBinding<TooltipBinding>): TooltipOptions {
  const v = binding.value
  if (typeof v === "string") return {content: v}
  if (v && typeof v === "object") return v
  return {content: ""}
}

function attach(el: HTMLElement, opts: TooltipOptions): void {
  detach(el)

  const handlers = {
    enter: () => controller.show(el, opts),
    leave: () => controller.hide(),
  }

  el.addEventListener("mouseenter", handlers.enter, {passive: true})
  el.addEventListener("mouseleave", handlers.leave, {passive: true})
  el.addEventListener("focus", handlers.enter, {passive: true})
  el.addEventListener("blur", handlers.leave, {passive: true})

  el[HANDLERS] = handlers
}

function detach(el: HTMLElement): void {
  const h = el[HANDLERS]
  if (!h) return

  el.removeEventListener("mouseenter", h.enter)
  el.removeEventListener("mouseleave", h.leave)
  el.removeEventListener("focus", h.enter)
  el.removeEventListener("blur", h.leave)

  delete el[HANDLERS]
}
