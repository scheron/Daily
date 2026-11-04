export function formatMarkdownDestination(url: string, title?: string) {
  const escapedUrl = url.replace(/[\\<>]/g, "\\$&")
  const destination = /[\s()<>]/.test(url) ? `<${escapedUrl}>` : escapedUrl
  const escapedTitle = title?.replace(/[\\"]/g, "\\$&")

  return escapedTitle ? `${destination} "${escapedTitle}"` : destination
}
