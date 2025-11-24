import {hexToRgb, rgbToHex} from "./rgbToHex"

/**
 * Converts an OKLCH color string to a hexadecimal color string
 * @param color - The OKLCH color string
 * @returns The hexadecimal color string
 */
export function oklchToHex(color: string): string {
  const matches = color.match(/oklch\(\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\)/)
  if (!matches) return color

  const [, l, c, h] = matches
  const lightness = parseFloat(l) / 100
  const chroma = parseFloat(c)
  const hue = parseFloat(h)

  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b

  const l_cube = l_ * l_ * l_
  const m_cube = m_ * m_ * m_
  const s_cube = s_ * s_ * s_

  const r = 4.0767416621 * l_cube - 3.3077115913 * m_cube + 0.2309699292 * s_cube
  const g = -1.2684380046 * l_cube + 2.6097574011 * m_cube - 0.3413193965 * s_cube
  const b_val = -0.0041960863 * l_cube - 0.7034186147 * m_cube + 1.707614701 * s_cube

  const r_8bit = Math.max(0, Math.min(255, Math.round(r * 255)))
  const g_8bit = Math.max(0, Math.min(255, Math.round(g * 255)))
  const b_8bit = Math.max(0, Math.min(255, Math.round(b_val * 255)))

  return rgbToHex(r_8bit, g_8bit, b_8bit)
}

export {hexToRgb, rgbToHex}
