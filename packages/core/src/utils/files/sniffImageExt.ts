const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38]
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]
const WEBP_SIGNATURE_OFFSET = 8

/**
 * Derives an image file extension from a buffer's magic bytes, ignoring any
 * filename. Returns `null` when the buffer does not match a recognised
 * signature, never throws.
 */
export function sniffImageExt(data: Buffer): string | null {
  if (matchesAt(data, PNG_SIGNATURE, 0)) return "png"
  if (matchesAt(data, JPEG_SIGNATURE, 0)) return "jpg"
  if (matchesAt(data, GIF_SIGNATURE, 0)) return "gif"
  if (matchesAt(data, RIFF_SIGNATURE, 0) && matchesAt(data, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)) return "webp"

  return null
}

function matchesAt(data: Buffer, signature: number[], offset: number): boolean {
  if (data.length < offset + signature.length) return false
  return signature.every((byte, index) => data[offset + index] === byte)
}
