import {imgSize, obsidianImgSize} from "@mdit/plugin-img-size"
import hljs from "highlight.js"
import MarkdownIt from "markdown-it"
// @ts-ignore
import TodoList from "markdown-it-task-lists"

import "highlight.js/styles/github-dark.css"

type AssetPreviewMap = Record<string, string>

export function useMarkdown() {
  const markdownIt = new MarkdownIt({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, {language: lang}).value
        } catch {
          return ""
        }
      }
      return ""
    },
  })

  markdownIt.use(TodoList)
  markdownIt.use(imgSize)
  markdownIt.use(obsidianImgSize)

  patchMarkdownItAnchors(markdownIt)

  function renderMarkdown(text: string) {
    // Add safe-file:// prefix to images that don't have a protocol
    const processedText = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('safe-file://') || src.startsWith('attachment:')) {
        return match
      }
      return `![${alt}](safe-file://${src})`
    })
    return markdownIt.render(processedText)
  }

  function applyPreviewImages(content: string, assets: AssetPreviewMap): string {
    return content.replace(/!\[\]\(attachment:([a-zA-Z0-9_-]+)\)/g, (_, id) => {
      const dataUrl = assets[id]
      return dataUrl ? `<img src="${dataUrl}" data-attachment="${id}" alt="" />` : `![broken](attachment:${id})`
    })
  }

  function convertImagesToMarkdown(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement
    const imgs = clone.querySelectorAll("img[data-attachment]")

    for (const img of Array.from(imgs)) {
      const id = img.getAttribute("data-attachment")
      if (!id) continue

      const replacement = document.createElement("span")
      replacement.innerText = `![](attachment:${id})`
      img.replaceWith(replacement)
    }

    return clone.innerText.trim()
  }

  function parseMarkdown(html: string) {
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = html
    return tempDiv.textContent || ""
  }

  return {
    renderMarkdown,
    parseMarkdown,
    applyPreviewImages,
    convertImagesToMarkdown,
  }
}

function patchMarkdownItAnchors(markdownIt: MarkdownIt) {
  const defaultRender =
    markdownIt.renderer.rules.link_open ||
    function (tokens, idx, options, _, self) {
      return self.renderToken(tokens, idx, options)
    }

  markdownIt.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrPush(["target", "_blank"])
    tokens[idx].attrPush(["rel", "noopener noreferrer"])
    return defaultRender(tokens, idx, options, env, self)
  }
}
