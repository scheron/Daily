import "./markdownImage.css"

type MarkdownImage = {url: string; alt: string; title?: string}

/** The decoded alt may end in a Daily size suffix, such as `Screenshot =320x160`. */
export function createMarkdownImage({url, alt, title}: MarkdownImage): HTMLSpanElement {
  const dimensions = alt.match(/\s*=(\d+)x(\d+)$/)
  const name = (dimensions ? alt.slice(0, dimensions.index) : alt) || "image"
  const width = dimensions ? Number(dimensions[1]) : undefined
  const height = dimensions ? Number(dimensions[2]) : undefined
  const wrapper = document.createElement("span")
  wrapper.className = "markdown-image"

  const img = document.createElement("img")
  img.alt = name
  if (title) img.title = title
  if (width) img.style.width = `${width}px`
  else if (height) img.style.height = `${height}px`

  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  img.onerror = () => {
    if (timer !== undefined) clearTimeout(timer)
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
    notice.append(message, button)
    return notice
  }
}
