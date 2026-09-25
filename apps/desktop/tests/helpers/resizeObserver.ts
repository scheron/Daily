type FakeResizeCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void

class FakeResizeObserver {
  static instances = new Set<FakeResizeObserver>()

  private targets = new Set<Element>()

  constructor(private callback: FakeResizeCallback) {
    FakeResizeObserver.instances.add(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    FakeResizeObserver.instances.delete(this)
  }

  deliver(targets: Element[]) {
    const entries = targets.filter((target) => this.targets.has(target)).map((target) => ({target, contentRect: target.getBoundingClientRect()}))
    if (entries.length > 0) this.callback(entries as ResizeObserverEntry[], this as unknown as ResizeObserver)
  }

  deliverEveryObservedTarget() {
    this.deliver([...this.targets])
  }
}

/**
 * Installs a fake `ResizeObserver` on `window` that delivers entries only when told to — happy-dom's own never
 * delivers. `deliverResize` takes the elements to resize; `deliverResizeToObserved` instead resizes whatever
 * each observer currently has registered, for a test that shouldn't need to know which element that is. Either
 * way, each observer instance gets its own callback call with just its subset, the way the browser batches one
 * delivery per observer. Idempotent, so a shared module-level observer built against an earlier call stays
 * deliverable.
 */
export function installFakeResizeObserver() {
  ;(globalThis as any).ResizeObserver = FakeResizeObserver
  ;(globalThis as any).window.ResizeObserver = FakeResizeObserver

  return {
    deliverResize(...targets: Element[]) {
      for (const instance of FakeResizeObserver.instances) instance.deliver(targets)
    },
    deliverResizeToObserved() {
      for (const instance of FakeResizeObserver.instances) instance.deliverEveryObservedTarget()
    },
  }
}

/** Overrides read-only layout getters (`offsetWidth`, `scrollHeight`, …) that happy-dom always reports as `0`. */
export function stubLayout(element: Element, values: Partial<Record<"offsetWidth" | "offsetHeight" | "scrollWidth" | "scrollHeight", number>>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, {value, configurable: true})
  }
}
