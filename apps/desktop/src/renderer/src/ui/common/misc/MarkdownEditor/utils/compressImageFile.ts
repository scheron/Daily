export async function compressImageFile(file: File): Promise<{blob: Blob; width: number; height: number}> {
  const maxWidth = 1024
  const maxHeight = 1024
  const quality = 0.9

  const bitmap = await createImageBitmap(file)

  const ratio = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1)
  const width = Math.round(bitmap.width * ratio)
  const height = Math.round(bitmap.height * ratio)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context is not available")

  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error("Failed to compress image"))
        resolve(b)
      },
      "image/webp",
      quality,
    )
  })

  bitmap.close()
  return {blob, width, height}
}
