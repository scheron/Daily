import {hexToRgb, rgbToHex} from "./rgbToHex"

/**
 * Gets the opposite color of a given color
 * @param hexColor - The hexadecimal color string to get the opposite of
 * @returns The opposite color
 */
export function getOppositeColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor)
  const r = Math.round(rgb.r + (255 - rgb.r) * 0.7)
  const g = Math.round(rgb.g + (255 - rgb.g) * 0.7)
  const b = Math.round(rgb.b + (255 - rgb.b) * 0.7)
  return rgbToHex(r, g, b)
}
