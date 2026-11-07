import MarkdownIt from "markdown-it"

import {isObject} from "@daily/std"

import {WHATS_NEW_MEDIA_SOURCES} from "@main/config/security"
import {UPDATES_CONFIG} from "@shared/config/updates"
import {githubCooldown} from "./utils/githubCooldown"

import type {WhatsNewMedia, WhatsNewRelease} from "@shared/types/update"

type JsonObject = Record<string, unknown>

let cooldown = {restNotBefore: 0, fallbackFailures: 0}

export async function fetchWhatsNewRelease(version: string): Promise<WhatsNewRelease | null> {
  const tag = `v${version}`
  const url = `https://api.github.com/repos/${UPDATES_CONFIG.githubRepo}/releases/tags/${encodeURIComponent(tag)}`
  const maxAttempts = 2

  for (let attempt = 0; attempt < maxAttempts && Date.now() >= cooldown.restNotBefore; attempt++) {
    if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, 400))

    const response = await fetch(url, {
      headers: UPDATES_CONFIG.githubHeaders,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null)
    if (!response) continue

    const payload: unknown = await response.json().catch(() => null)
    const message = isObject<JsonObject>(payload) && typeof payload.message === "string" ? payload.message : null
    cooldown =
      githubCooldown({status: response.status, ok: response.ok, headers: response.headers, message}, Date.now(), cooldown.fallbackFailures) ??
      cooldown
    if (response.ok) return readRelease(payload, tag, version)
    if (response.status < 500) return null
  }

  return null
}

export function whatsNewReleaseUrl(version: string): string {
  return `https://github.com/${UPDATES_CONFIG.githubRepo}/releases/tag/${encodeURIComponent(`v${version}`)}`
}

export function isSafeWhatsNewMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  const url = URL.parse(value)
  if (url?.protocol !== "https:" || url.username || url.password || url.port) return false
  return WHATS_NEW_MEDIA_SOURCES.some((source) => url.href.startsWith(source))
}

function readRelease(payload: unknown, tag: string, version: string): WhatsNewRelease | null {
  if (!isObject<JsonObject>(payload) || payload.tag_name !== tag || payload.draft !== false || typeof payload.body !== "string") return null

  const markdown = new MarkdownIt({html: true, linkify: true})
  const tokens = markdown.parse(payload.body.slice(0, 125_000), {})
  const media = new Map<string, WhatsNewMedia>()
  const listHighlights: string[] = []
  const paragraphHighlights: string[] = []
  let listDepth = 0

  for (const [index, token] of tokens.entries()) {
    if (token.type === "list_item_open") listDepth++
    if (token.type === "list_item_close") listDepth--
    if (token.type === "html_block") readHtmlMedia(token.content, addMedia)
    if (token.type !== "inline") continue

    const highlight = summarize(readInline(token.children ?? [], addMedia))
    if (!highlight || tokens[index - 1]?.type !== "paragraph_open" || /^full changelog\b/i.test(highlight)) continue
    if (listDepth === 1) listHighlights.push(highlight)
    if (listDepth === 0 && token.level === 1) paragraphHighlights.push(highlight)
  }

  const highlights = (listHighlights.length ? listHighlights : paragraphHighlights).slice(0, 3)
  if (!highlights.length) return null

  if (Array.isArray(payload.assets)) {
    for (const asset of payload.assets) {
      if (!isObject<JsonObject>(asset) || typeof asset.name !== "string" || typeof asset.browser_download_url !== "string") continue
      const kind = mediaKind(asset.name)
      if (kind) addMedia(asset.browser_download_url, asset.name, kind)
    }
  }

  return {version, releaseUrl: whatsNewReleaseUrl(version), highlights, media: [...media.values()]}

  function addMedia(url: string, label: string, kind: WhatsNewMedia["kind"], poster?: string) {
    if (!isSafeWhatsNewMediaUrl(url) || media.has(url)) return
    const item: WhatsNewMedia = {kind, url, label: summarize(label)}
    if (poster && isSafeWhatsNewMediaUrl(poster) && mediaKind(poster) === "image") item.poster = poster
    media.set(url, item)
  }
}

type AddMedia = (url: string, label: string, kind: WhatsNewMedia["kind"], poster?: string) => void

function readInline(tokens: ReturnType<MarkdownIt["parse"]>, addMedia: AddMedia): string {
  const text: string[] = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type === "image") {
      const url = token.attrGet("src") ?? ""
      const kind = mediaKind(url)
      if (kind !== "video") addMedia(url, token.content, kind ?? "image")
    } else if (token.type === "link_open") {
      const url = token.attrGet("href") ?? ""
      const kind = mediaKind(url)
      if ((kind !== "video" && kind !== "gif") || !isSafeWhatsNewMediaUrl(url)) continue
      const end = tokens.findIndex((child, childIndex) => childIndex > index && child.type === "link_close")
      if (end < 0) continue
      const label = tokens
        .slice(index + 1, end)
        .map((child) => child.content)
        .join("")
      addMedia(url, label === url ? "" : label, kind)
      index = end
    } else if (token.type === "html_inline") {
      readHtmlMedia(token.content, addMedia)
    } else if (token.type === "text" || token.type === "code_inline") {
      text.push(token.content)
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      text.push(" ")
    }
  }
  return text.join("")
}

function readHtmlMedia(html: string, addMedia: AddMedia) {
  if (!/^\s*<(?:video|img)\b/i.test(html)) return

  for (const [, videoAttributes, body, name, openingAttributes] of html.matchAll(
    /<video\b([^>]*?)>([\s\S]*?)<\/video\s*>|<(video|img)\b([^>]*?)>/gi,
  )) {
    const attrs = readAttributes(videoAttributes ?? openingAttributes)
    if (name?.toLowerCase() !== "img") {
      const source = body?.match(/<source\b([^>]*?)>/i)?.[1]
      const url = attrs.src ?? (source ? readAttributes(source).src : undefined)
      if (url) addMedia(url, attrs["aria-label"] ?? attrs.title ?? "", "video", attrs.poster)
    } else if (attrs.src) {
      const kind = mediaKind(attrs.src)
      if (kind !== "video") addMedia(attrs.src, attrs.alt ?? "", kind ?? "image")
    }
  }

  function readAttributes(source: string): Record<string, string> {
    return Object.fromEntries(
      Array.from(source.matchAll(/\s+([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g), ([, key, quoted, single, bare]) => [
        key.toLowerCase(),
        (quoted ?? single ?? bare).replaceAll("&amp;", "&"),
      ]),
    )
  }
}

function mediaKind(source: string): WhatsNewMedia["kind"] | undefined {
  const path = URL.parse(source)?.pathname ?? source
  if (/\.gif$/i.test(path)) return "gif"
  if (/\.(?:mp4|webm)$/i.test(path)) return "video"
  if (/\.(?:avif|jpe?g|png|webp)$/i.test(path)) return "image"
}

function summarize(text: string): string {
  const summary = text.replace(/\s+/g, " ").trim()
  if (summary.length <= 160) return summary
  const clipped = summary.slice(0, 159)
  const lastSpace = clipped.lastIndexOf(" ")
  return `${lastSpace > 120 ? clipped.slice(0, lastSpace) : clipped}…`
}
