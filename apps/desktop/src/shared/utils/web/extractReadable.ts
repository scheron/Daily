import {parseHTML} from "linkedom"

import {Readability} from "@mozilla/readability"

export type ReadableExtract = {title: string | null; text: string; emptyShell: boolean}

/**
 * Extracts readable text from an HTML document via Readability. Non-HTML
 * content is returned as-is (trimmed). When extraction yields fewer than
 * `emptyShellThreshold` chars (a client-rendered shell), `emptyShell` is true.
 *
 * @example extractReadable("<article>…</article>", "https://x.dev/p")
 */
export function extractReadable(body: string, url: string, contentType = "text/html", emptyShellThreshold = 64): ReadableExtract {
  if (!contentType.includes("html") && !contentType.includes("xml")) {
    const text = body.trim()
    return {title: null, text, emptyShell: false}
  }

  const {document} = parseHTML(body)
  document.querySelectorAll("script, style, noscript, template, iframe").forEach((n) => n.remove())

  const reader = new Readability(document)
  const parsed = reader.parse()

  const text = (parsed?.textContent || document.body?.textContent || document.documentElement?.textContent || "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const title = parsed?.title ?? document.title ?? null

  return {title, text, emptyShell: text.length < emptyShellThreshold}
}
