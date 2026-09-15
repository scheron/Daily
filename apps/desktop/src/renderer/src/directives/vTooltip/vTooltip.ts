import {isString} from "@daily/std"

import {TooltipController} from "./TooltipController"

import type {Directive, DirectiveBinding} from "vue"
import type {TooltipOptions} from "./TooltipController"

type TooltipBinding = string | TooltipOptions

const controller = new TooltipController()
const HANDLERS = Symbol("tooltip")

export default {
  mounted(el, binding) {
    controller.register()
    const opts = parse(binding)
    if (opts.content) attach(el, opts)
  },

  updated(el, binding) {
    const opts = parse(binding)
    if (!opts.content) {
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
  if (isString(v)) return {content: v}
  if (v && typeof v === "object") return v
  return {content: ""}
}

function attach(el: HTMLElement, opts: TooltipOptions) {
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

function detach(el: HTMLElement) {
  const h = el[HANDLERS]
  if (!h) return

  el.removeEventListener("mouseenter", h.enter)
  el.removeEventListener("mouseleave", h.leave)
  el.removeEventListener("focus", h.enter)
  el.removeEventListener("blur", h.leave)

  delete el[HANDLERS]
}
