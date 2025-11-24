/**
 * Converts RGB values to a hexadecimal color string
 * @param r - The red component (0-255)
 * @param g - The green component (0-255)
 * @param b - The blue component (0-255)
 * @returns The hexadecimal color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/**
 * Converts a hexadecimal color string to RGB values
 * @param hex - The hexadecimal color string
 * @returns The RGB values
 */
export function hexToRgb(hex: string): {r: number; g: number; b: number} {
  const bigint = parseInt(hex.slice(1), 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}
