import {FILE_EXTENSION_REGEX} from "@/constants/regex"

/** Uses the original filename without its extension, or `"image"` if the label is empty. */
export function toImageAltText(filename: string): string {
  const withoutExtension = filename.replace(FILE_EXTENSION_REGEX, "").trim()

  return withoutExtension || "image"
}
