export function calcProportionSize(width: number, height: number): {width: number; height: number} {
  const maxSize = 500
  if (width <= maxSize && height <= maxSize) return {width, height}

  const ratio = Math.min(maxSize / width, maxSize / height)

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}
