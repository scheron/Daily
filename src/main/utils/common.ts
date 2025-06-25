export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
