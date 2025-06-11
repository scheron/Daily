import {sleep} from "@/utils/misc"

export async function animateSwipe(direction: "forward" | "backward", onProgress: (offset: number, opacity: number) => void) {
  const config = {
    distance: 50,
    step: 2,
    forwardDuration: 10,
    backwardDuration: 5,
    delay: 0,
  }

  const steps = Math.abs(config.distance / config.step)
  const stepDuration = direction === "forward" ? config.forwardDuration : config.backwardDuration

  const start = direction === "forward" ? 0 : config.distance
  const end = direction === "forward" ? config.distance : 0

  for (let i = 0; i <= steps; i++) {
    const progress = i / steps
    const offset = start + (end - start) * progress
    const opacity = (Math.abs(offset) * 2) / 100

    onProgress(offset, opacity)
    await sleep(stepDuration)
  }

  if (config.delay) await sleep(config.delay)
}
