/**
 * Races the renderer's readiness signal against a ceiling, and never rejects: whichever settles
 * first decides the outcome. Pure — no Electron, no window, so it is testable without either.
 *
 * @param signal resolves once the renderer says it is ready
 * @param ceilingMs the longest this waits before giving up on the signal
 */
export function awaitRendererReady(signal: Promise<void>, ceilingMs: number): Promise<"signalled" | "timed-out"> {
  return new Promise((resolve) => {
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve("timed-out")
    }, ceilingMs)

    void signal.then(() => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve("signalled")
    })
  })
}
