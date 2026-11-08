import "./markdownImage.css"

import {MARKDOWN_IMAGE_DIMENSIONS_REGEX} from "@/constants/regex"

type MarkdownImage = {url: string; alt: string; title?: string; isReadOnly?: boolean}

/** The decoded alt may end in a Daily size suffix, such as `Screenshot =320x160`. */
export function createMarkdownImage({url, alt, title, isReadOnly}: MarkdownImage): HTMLSpanElement {
  const dimensions = alt.match(MARKDOWN_IMAGE_DIMENSIONS_REGEX)
  const name = (dimensions ? alt.slice(0, dimensions.index) : alt) || "image"
  const width = dimensions ? Number(dimensions[1]) : null
  const height = dimensions ? Number(dimensions[2]) : null
  const wrapper = document.createElement("span")
  wrapper.className = "markdown-image"

  const img = document.createElement("img")
  img.alt = name
  if (title) img.title = title
  if (width) img.style.width = `${width}px`
  else if (height) img.style.height = `${height}px`

  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  img.onerror = () => {
    if (timer !== null) clearTimeout(timer)
    if (attempts >= 3) {
      wrapper.replaceChildren(createErrorNotice())
      return
    }

    attempts++
    timer = setTimeout(() => {
      if (wrapper.isConnected) reload()
    }, 2000)
  }

  wrapper.append(img)
  img.src = url
  return wrapper

  function reload() {
    const fragmentAt = url.indexOf("#")
    const base = fragmentAt === -1 ? url : url.slice(0, fragmentAt)
    const fragment = fragmentAt === -1 ? "" : url.slice(fragmentAt)
    img.src = `${base}${base.includes("?") ? "&" : "?"}retry=${Date.now()}${fragment}`
  }

  function createErrorNotice() {
    const notice = document.createElement("span")
    notice.className = "markdown-image-error"
    if (width) notice.style.width = `${width}px`

    const message = document.createElement("span")
    message.textContent = `Failed to load image: ${name}`
    notice.append(message)
    if (isReadOnly) return notice

    const button = document.createElement("button")
    button.type = "button"
    button.textContent = "Retry"
    button.onclick = (event) => {
      event.preventDefault()
      event.stopPropagation()
      attempts = 0
      wrapper.replaceChildren(img)
      reload()
    }
    notice.append(button)
    return notice
  }
}
