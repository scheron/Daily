document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("maskCanvas")

  let isAnimating = false
  let currentTheme = "0"

  function switchPreview(targetTheme) {
    if (isAnimating || targetTheme === currentTheme) return

    isAnimating = true

    canvas.style.visibility = "hidden"

    const currentImage = document.querySelector(`[data-theme="${currentTheme}"]`)
    const targetImage = document.querySelector(`[data-theme="${targetTheme}"]`)

    if (!currentImage || !targetImage) {
      isAnimating = false
      return
    }

    function onTransitionEnd() {
      targetImage.removeEventListener("transitionend", onTransitionEnd)
      isAnimating = false
    }

    targetImage.addEventListener("transitionend", onTransitionEnd)

    currentImage.style.opacity = "0"
    targetImage.style.opacity = "1"

    currentTheme = targetTheme
  }

  const previewButtons = document.querySelectorAll(".preview-btn")

  previewButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchPreview(btn.getAttribute("data-preview")))
  })
})
