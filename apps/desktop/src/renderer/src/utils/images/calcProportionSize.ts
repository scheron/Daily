export function calcProportionSize(width: number, height: number, maxSize: number = 500): {width: number; height: number} {
  if (width <= maxSize && height <= maxSize) return {width, height}

  const ratio = Math.min(maxSize / width, maxSize / height)

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}
