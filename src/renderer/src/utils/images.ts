export function getImageDimensions(dataUrl: string): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

export function calculateProportionalSize(width: number, height: number, maxSize: number = 500): {width: number; height: number} {
  if (width <= maxSize && height <= maxSize) return {width, height}

  const ratio = Math.min(maxSize / width, maxSize / height)

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}
