export type TooltipPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end"

export type TooltipOptions = {
  content: string
  placement?: TooltipPlacement
  delay?: number
  offset?: number
  disabled?: boolean
}

const TOOLTIP_ID = "v-tooltip-container"
const PADDING = 8
const DEFAULT_OFFSET = 8
const DEFAULT_DELAY = 1200

export class TooltipController {
  private container: HTMLElement | null = null
  private target: HTMLElement | null = null
  private options: TooltipOptions = {content: ""}
  private timerId: number | null = null
  private isVisible = false
  private refCount = 0

  show(element: HTMLElement, options: TooltipOptions): void {
    if (options.disabled || !options.content) return

    this.clear()
    this.target = element
    this.options = options

    const delay = options.delay ?? DEFAULT_DELAY
    if (delay > 0) {
      this.timerId = window.setTimeout(() => this.render(), delay)
    } else {
      this.render()
    }
  }

  hide(): void {
    this.clear()
    if (!this.container || !this.isVisible) return

    this.container.setAttribute("aria-hidden", "true")
    this.isVisible = false
    this.target = null
  }

  hideIfTarget(element: HTMLElement): void {
    if (this.target === element) this.hide()
  }

  register(): void {
    this.refCount++
  }

  unregister(): void {
    if (--this.refCount <= 0) this.destroy()
  }

  private clear(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  private render(): void {
    if (!this.target || !this.options.content) return

    const container = this.getContainer()
    container.textContent = this.options.content

    requestAnimationFrame(() => {
      this.position()
      container.setAttribute("aria-hidden", "false")
      this.isVisible = true
    })
  }

  private getContainer(): HTMLElement {
    if (this.container) return this.container

    const existing = document.getElementById(TOOLTIP_ID)
    if (existing) {
      this.container = existing
      return existing
    }

    const el = document.createElement("div")
    el.id = TOOLTIP_ID
    el.setAttribute("role", "tooltip")
    el.setAttribute("aria-hidden", "true")
    document.body.appendChild(el)

    this.container = el
    return el
  }

  private position(): void {
    if (!this.target || !this.container) return

    const placement = this.options.placement ?? "top"
    const offset = this.options.offset ?? DEFAULT_OFFSET
    const target = this.target.getBoundingClientRect()
    const tooltip = this.container.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let {x, y} = this.calcPosition(target, tooltip, placement, offset)

    // Clamp horizontal
    x = Math.max(PADDING, Math.min(x, vw - tooltip.width - PADDING))

    // Vertical flip if needed
    if (y < PADDING && placement.startsWith("top")) {
      y = target.bottom + offset
    } else if (y + tooltip.height > vh - PADDING && placement.startsWith("bottom")) {
      y = target.top - tooltip.height - offset
    }
    y = Math.max(PADDING, Math.min(y, vh - tooltip.height - PADDING))

    this.container.style.left = `${Math.round(x)}px`
    this.container.style.top = `${Math.round(y)}px`
  }

  private calcPosition(t: DOMRect, tip: DOMRect, p: TooltipPlacement, o: number): {x: number; y: number} {
    const top = t.top - tip.height - o
    const bottom = t.bottom + o
    const left = t.left - tip.width - o
    const right = t.right + o
    const cx = t.left + (t.width - tip.width) / 2
    const cy = t.top + (t.height - tip.height) / 2

    switch (p) {
      case "top":
        return {x: cx, y: top}
      case "top-start":
        return {x: t.left, y: top}
      case "top-end":
        return {x: t.right - tip.width, y: top}
      case "bottom":
        return {x: cx, y: bottom}
      case "bottom-start":
        return {x: t.left, y: bottom}
      case "bottom-end":
        return {x: t.right - tip.width, y: bottom}
      case "left":
        return {x: left, y: cy}
      case "left-start":
        return {x: left, y: t.top}
      case "left-end":
        return {x: left, y: t.bottom - tip.height}
      case "right":
        return {x: right, y: cy}
      case "right-start":
        return {x: right, y: t.top}
      case "right-end":
        return {x: right, y: t.bottom - tip.height}
    }
  }

  private destroy(): void {
    this.clear()
    this.container?.remove()
    this.container = null
    this.target = null
    this.isVisible = false
    this.refCount = 0
  }
}
