/** Uses the original filename without its extension, or `"image"` if the label is empty. */
export function toImageAltText(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "").trim()

  return withoutExtension || "image"
}
