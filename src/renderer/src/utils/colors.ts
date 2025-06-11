type RGB = {r: number; g: number; b: number}

function hexToRgb(hex: string): RGB {
  const bigint = parseInt(hex.slice(1), 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

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

export function getOppositeColor(color: string): string {
  const rgb = hexToRgb(color)
  const r = Math.round(rgb.r + (255 - rgb.r) * 0.7)
  const g = Math.round(rgb.g + (255 - rgb.g) * 0.7)
  const b = Math.round(rgb.b + (255 - rgb.b) * 0.7)
  return rgbToHex(r, g, b)
}

export function oklchToHex(color: string): string {
  const matches = color.match(/oklch\((\d+)%\s+(\d*\.?\d+)\s+(\d+)\)/)
  if (!matches) return color

  const [, l, c, h] = matches
  const lightness = parseFloat(l) / 100
  const chroma = parseFloat(c)
  const hue = parseFloat(h)

  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s_ = lightness - 0.0894841775 * a - 1.2914855480 * b

  const l_cube = l_ * l_ * l_
  const m_cube = m_ * m_ * m_
  const s_cube = s_ * s_ * s_

  const r = 4.0767416621 * l_cube - 3.3077115913 * m_cube + 0.2309699292 * s_cube
  const g = -1.2684380046 * l_cube + 2.6097574011 * m_cube - 0.3413193965 * s_cube
  const b_val = -0.0041960863 * l_cube - 0.7034186147 * m_cube + 1.7076147010 * s_cube

  const r_8bit = Math.max(0, Math.min(255, Math.round(r * 255)))
  const g_8bit = Math.max(0, Math.min(255, Math.round(g * 255)))
  const b_8bit = Math.max(0, Math.min(255, Math.round(b_val * 255)))

  return rgbToHex(r_8bit, g_8bit, b_8bit)
}