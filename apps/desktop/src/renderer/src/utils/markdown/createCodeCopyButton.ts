export function createCodeCopyButton(readCode: () => string) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "markdown-code-copy"
  button.setAttribute("aria-label", "Copy code")
  button.contentEditable = "false"
  button.innerHTML = iconMarkup("copy")

  let feedbackTimer: ReturnType<typeof setTimeout> | undefined
  button.addEventListener("mousedown", (event) => event.preventDefault())
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void navigator.clipboard.writeText(readCode()).then(
      () => {
        button.innerHTML = iconMarkup("check")
        button.classList.add("is-copied")
        clearTimeout(feedbackTimer)
        feedbackTimer = setTimeout(() => {
          button.innerHTML = iconMarkup("copy")
          button.classList.remove("is-copied")
        }, 1500)
      },
      () => {},
    )
  })

  return button

  function iconMarkup(name: "copy" | "check") {
    return `<svg class="markdown-code-copy-icon" width="14" height="14" aria-hidden="true"><use href="#${name}" /></svg>`
  }
}
