export function stripHtml(html: string): string {
  if (!html) return ""
  // First remove HTML tags
  let result = html.replace(/<\/?[^>]+(>|$)/g, "")
  // Decode HTML entities in correct order to prevent double-unescaping
  // Replace numeric entities first, then named entities (most specific first)
  // Use word boundary or semicolon to ensure we match complete entities only
  result = result
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number.parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Replace &amp; last, but only if it's a complete entity (followed by non-word char or end of string)
    // This prevents double-unescaping of already unescaped & characters
    .replace(/&amp;(?![a-zA-Z#])/g, "&")
  return result
}
