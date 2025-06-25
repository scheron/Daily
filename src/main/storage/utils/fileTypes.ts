export function extractFilenames(content: string): string[] {
  // Match both formats:
  // ![alt](filename.ext) - clean format
  // ![alt](safe-file://filename.ext) - with protocol
  const patterns = [
    /!\[[^\]]*\]\(\s*safe-file:\/\/([^)\s]+)\s*\)/g, // with safe-file:// prefix
    /!\[[^\]]*\]\(\s*(?!(?:https?|data|temp|safe-file):)([^)\s]+)\s*\)/g, // without protocol
  ]

  const filenames = new Set<string>()
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      filenames.add(match[1])
    }
  }

  return Array.from(filenames)
}

export function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    case "svg":
      return "image/svg+xml"
    default:
      return "application/octet-stream"
  }
}

export function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}