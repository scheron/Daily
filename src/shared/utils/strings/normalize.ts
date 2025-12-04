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

  // Convert to lowercase
  text = text.toLowerCase()

  // Remove markdown formatting
  // Remove code blocks (```...```)
  text = text.replace(/```[\s\S]*?```/g, " ")
  // Remove inline code (`...`)
  text = text.replace(/`([^`]+)`/g, "$1")
  // Remove bold (**text** or __text__)
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2")
  // Remove italic (*text* or _text_)
  text = text.replace(/(\*|_)(.*?)\1/g, "$2")
  // Remove links [text](url)
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  // Remove images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  // Remove headings (# ## ###)
  text = text.replace(/^#{1,6}\s+/gm, "")
  // Remove blockquotes (>)
  text = text.replace(/^>\s+/gm, "")
  // Remove list markers (-, *, +, 1.)
  text = text.replace(/^[\s]*[-*+]\s+/gm, "")
  text = text.replace(/^[\s]*\d+\.\s+/gm, "")
  // Remove horizontal rules (---, ***)
  text = text.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, " ")

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim()

  // Limit length
  if (text.length > maxLength) {
    text = text.substring(0, maxLength)
  }

  return text
}
