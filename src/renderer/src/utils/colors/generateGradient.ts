import {hexToRgb, rgbToHex} from "./oklchToHex"

export function generateGradient(fromHex: string, toHex: string, steps: number = 10): string[] {
  const fromRgb = hexToRgb(fromHex)
  const toRgb = hexToRgb(toHex)

  const palette: string[] = []

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * t)
    const g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * t)
    const b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * t)
    palette.push(rgbToHex(r, g, b))
  }

  return palette
}
