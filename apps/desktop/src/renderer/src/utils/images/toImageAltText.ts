/**
 * Derives the markdown alt text for an uploaded image from its original
 * filename, dropping the extension: images are re-encoded on upload, so the
 * uploaded name's extension no longer describes what is stored.
 *
 * @param filename - Original `File.name`, possibly empty
 * @example toImageAltText("Screenshot.png") // "Screenshot"
 */
export function toImageAltText(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "").trim()

  return withoutExtension || "image"
}
