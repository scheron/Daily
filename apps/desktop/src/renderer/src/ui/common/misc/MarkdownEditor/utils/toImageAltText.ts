/**
 * Drops the extension: images are re-encoded on upload, so the original extension no longer
 * describes what is stored. Falls back to `"image"` when nothing is left.
 */
export function toImageAltText(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "").trim()

  return withoutExtension || "image"
}
