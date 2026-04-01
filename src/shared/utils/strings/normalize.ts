/**
 * Normalize a string
 * - Convert to lowercase
 * - Remove markdown formatting
 * - Limit to max length
 * @param content - The string to normalize
 * @param maxLength - The maximum length of the string to return
 * @returns The normalized string
 */
export function normalize(content: string, maxLength = 1000): string {
  let text = content

  text = text.toLowerCase()

  text = text.replace(/```[\s\S]*?```/g, " ")
  text = text.replace(/`([^`]+)`/g, "$1")
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2")
  text = text.replace(/(\*|_)(.*?)\1/g, "$2")
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  text = text.replace(/^#{1,6}\s+/gm, "")
  text = text.replace(/^>\s+/gm, "")
  text = text.replace(/^[\s]*[-*+]\s+/gm, "")
  text = text.replace(/^[\s]*\d+\.\s+/gm, "")
  text = text.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, " ")

  text = text.replace(/\s+/g, " ").trim()

  if (text.length > maxLength) {
    text = text.substring(0, maxLength)
  }

  return text
}
