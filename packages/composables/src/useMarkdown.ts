import hljs from "highlight.js"
import MarkdownIt from "markdown-it"
import { imgSize, obsidianImgSize } from "@mdit/plugin-img-size";

// @ts-ignore
import TodoList from "markdown-it-task-lists"

import "highlight.js/styles/github-dark.css"

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
    return markdownIt.render(text)
  }

  function parseMarkdown(html: string) {
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = html
    return tempDiv.textContent || ""
  }

  return {
    renderMarkdown,
    parseMarkdown,
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
