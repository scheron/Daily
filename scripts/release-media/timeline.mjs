/** Validate timing separately from rendering. No creative defaults are generated. */
export function normalizeTimeline(raw) {
  const timeline = {width: raw.width ?? 1920, height: raw.height ?? 1080, fps: raw.fps ?? 30, durationFrames: raw.durationFrames ?? raw.totalFrames}
  if (
    timeline.width !== 1920 ||
    timeline.height !== 1080 ||
    timeline.fps !== 30 ||
    !Number.isInteger(timeline.durationFrames) ||
    timeline.durationFrames < 240 ||
    timeline.durationFrames > 450
  )
    throw new Error("Timeline must be 1920 × 1080, 30 fps, and 240–450 frames (8–15 seconds).")
  timeline.parts = (raw.parts ?? raw.scenes ?? []).map((part, index) => ({
    ...part,
    id: part.id ?? `part-${String(index + 1).padStart(2, "0")}`,
    module: part.module ?? part.source ?? `authors/part-${String(index + 1).padStart(2, "0")}/scene.mjs`,
    start: part.start ?? part.startFrame,
    end: part.end ?? part.endFrame,
  }))
  if (!timeline.parts.length) throw new Error("Director timeline contains no parts.")
  const ids = new Set()
  for (const part of timeline.parts) {
    if (!/^part-\d{2,}$/.test(part.id) || ids.has(part.id)) throw new Error(`Invalid or duplicate part id: ${part.id}`)
    ids.add(part.id)
    if (
      !Number.isInteger(part.start) ||
      !Number.isInteger(part.end) ||
      part.start < 0 ||
      part.end <= part.start ||
      part.end > timeline.durationFrames ||
      (part.durationFrames !== undefined && part.durationFrames !== part.end - part.start)
    )
      throw new Error(`Invalid [start,end) for ${part.id}`)
    if (part.module !== `authors/${part.id}/scene.mjs`) throw new Error(`Invalid scene module: ${part.module}`)
  }
  timeline.transitions = raw.transitions ?? []
  for (const transition of timeline.transitions) {
    if (!["cut", "crossfade"].includes(transition.type)) throw new Error(`Unsupported transition: ${transition.type}`)
    const from = timeline.parts.find((part) => part.id === transition.from)
    const to = timeline.parts.find((part) => part.id === transition.to)
    if (!from || !to || from === to) throw new Error("Transition references invalid parts.")
    if (
      transition.type === "crossfade" &&
      (!Number.isInteger(transition.start) ||
        !Number.isInteger(transition.end) ||
        transition.end <= transition.start ||
        transition.start !== to.start ||
        transition.end !== from.end ||
        from.start >= to.start ||
        from.end >= to.end)
    )
      throw new Error("Crossfade must exactly describe the overlap between ordered parts.")
    if (transition.type === "cut" && from.end !== to.start) throw new Error("Cut parts must be contiguous.")
  }
  for (let frame = 0; frame < timeline.durationFrames; frame++) {
    const active = timeline.parts.filter((part) => frame >= part.start && frame < part.end)
    if (!active.length) throw new Error(`Uncovered global frame ${frame}`)
    if (
      active.length > 1 &&
      (active.length !== 2 ||
        timeline.transitions.filter(
          (transition) =>
            transition.type === "crossfade" &&
            frame >= transition.start &&
            frame < transition.end &&
            active.some((part) => part.id === transition.from) &&
            active.some((part) => part.id === transition.to),
        ).length !== 1)
    )
      throw new Error(`Ambiguous overlap at global frame ${frame}`)
  }
  return timeline
}
