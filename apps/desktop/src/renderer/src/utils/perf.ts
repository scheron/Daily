const IS_DEV = import.meta.env.DEV

export function perfMark(name: string) {
  if (IS_DEV) performance.mark(name)
}

export function perfMeasure(name: string, startMark: string) {
  if (IS_DEV) {
    const m = performance.measure(name, startMark)
    console.debug(`[PERF] ${name}: ${m.duration.toFixed(1)}ms`)
  }
}
