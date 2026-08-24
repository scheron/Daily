export type CompressionFormat = "image/png" | "image/jpeg" | "image/webp" | "auto"

export type CompressionOptions = {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 0–1
  format?: CompressionFormat
}

export async function compressImageFile(file: File, opts: CompressionOptions = {}): Promise<{blob: Blob; width: number; height: number}> {
  const {maxWidth = 1024, maxHeight = 1024, quality = 0.9, format = "image/webp"} = opts

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

  const targetFormat: string = format === "auto" ? (file.type === "image/png" ? "image/png" : "image/jpeg") : format

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error("Failed to compress image"))
        resolve(b)
      },
      targetFormat,
      quality,
    )
  })

  bitmap.close()
  return {blob, width, height}
}
